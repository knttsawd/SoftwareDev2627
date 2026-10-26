import { HTTP_STATUS, QUIZ_CHOICE_COUNT } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { get_study_tip } from './learning_style_hints.js';
import { build_mock_ai_student_answers, build_mock_ai_student_reply } from './mock_ai_student.js';
import { build_mock_assistant_step } from './mock_assistant.js';
import { build_mock_widget_app } from './widget_app_examples.js';
import {
  build_mock_explanation,
  build_mock_glossary,
  build_mock_learning_path,
  build_mock_lesson,
  build_mock_practice,
  build_mock_practice_check,
  build_mock_reading_guide,
  build_mock_reteach,
} from './mock_learning.js';
import { SOURCE_LABEL_PREFIX } from './source_selection.js';
import { count_topic_matches, find_keywords, get_topic_words, split_into_sentences } from './text_analysis.js';

// The free, offline "AI" used when AI_PROVIDER=mock. It doesn't understand anything: it
// picks the sentences from the student's resources that mention the topic most and turns
// them into notes, fill-in-the-blank questions and chat answers. It needs no API key, so
// every feature works while the app is being built. Unlike a real AI it has no general
// knowledge, so it needs resources to work from.

const NOTE_KEY_POINT_COUNT = 6;
const NOTE_KEY_TERM_COUNT = 5;
const QUIZ_KEYWORD_POOL_SIZE = 40;
const BLANK = '_____';
const DISTRACTOR_COUNT = QUIZ_CHOICE_COUNT - 1;
// Wrong choices that start with the same letters as the answer ("photosynthetic" for
// "photosynthesis") are too close to count as different answers.
const SHARED_STEM_LENGTH = 6;
const MOCK_NOTICE =
  '> Made in practice mode from sentences in your resources. Set AI_PROVIDER in server/.env to use a real AI model.';
export const NEEDS_SOURCES_MESSAGE =
  'Practice mode can only work from your resources, and there are none for this yet. Add a resource, or switch on a real AI in server/.env.';

// Practice mode has no general knowledge to fall back on, so it refuses work without sources.
export function assert_has_sources(source_text) {
  if (!source_text) throw create_http_error(HTTP_STATUS.unprocessable, NEEDS_SOURCES_MESSAGE);
}

// Removes the "[From: title]" lines that source selection adds, leaving only resource text.
export function strip_source_labels(source_text) {
  return source_text
    .split('\n')
    .filter((line) => !line.startsWith(SOURCE_LABEL_PREFIX))
    .join('\n');
}

// Sentences ordered by how often they mention the topic, ties in reading order.
export function rank_sentences(source_text, topic) {
  const topic_words = get_topic_words(topic);
  return split_into_sentences(strip_source_labels(source_text))
    .map((sentence, reading_order) => ({ sentence, reading_order, score: count_topic_matches(sentence, topic_words) }))
    .sort((first, second) => second.score - first.score || first.reading_order - second.reading_order);
}

// "**term**: the first sentence that uses it" for each keyword.
export function build_key_term_lines(sentences, key_terms) {
  return key_terms
    .map((key_term) => {
      const defining_sentence = sentences.find((sentence) => sentence.toLowerCase().includes(key_term));
      return defining_sentence ? `- **${key_term}**: ${defining_sentence}` : null;
    })
    .filter(Boolean);
}

export function build_mock_notes({ topic, source_text, learning_style }) {
  assert_has_sources(source_text);
  const plain_text = strip_source_labels(source_text);
  const key_points = rank_sentences(source_text, topic)
    .slice(0, NOTE_KEY_POINT_COUNT)
    .sort((first, second) => first.reading_order - second.reading_order)
    .map(({ sentence }) => sentence);
  const key_term_lines = build_key_term_lines(split_into_sentences(plain_text), find_keywords(plain_text, NOTE_KEY_TERM_COUNT));

  const sections = [`# ${topic}`, MOCK_NOTICE, '## Key points', ...key_points.map((point) => `- ${point}`)];
  if (key_term_lines.length > 0) sections.push('## Key terms', ...key_term_lines);
  sections.push('## Study tip', get_study_tip(learning_style));
  return { notes_markdown: sections.join('\n\n') };
}

// The longest keyword that appears in the sentence, which becomes the blanked-out answer.
export function pick_answer_word(sentence, keywords) {
  const sentence_words = new Set(sentence.toLowerCase().match(/[a-z0-9']+/g) ?? []);
  return keywords.filter((keyword) => sentence_words.has(keyword)).sort((first, second) => second.length - first.length)[0] ?? null;
}

// Replaces the first whole-word match of answer_word (any letter case) with a blank.
export function blank_out_word(sentence, answer_word) {
  return sentence.replace(new RegExp(`\\b${answer_word}\\b`, 'i'), BLANK);
}

// True when two words start with the same SHARED_STEM_LENGTH letters.
export function shares_word_stem(first_word, second_word) {
  return first_word.slice(0, SHARED_STEM_LENGTH) === second_word.slice(0, SHARED_STEM_LENGTH);
}

// Builds one fill-in-the-blank question, or null if the sentence has no usable answer word
// or there aren't enough other keywords to use as wrong choices. Wrong choices never appear
// in the sentence or look like the answer. The correct answer's position rotates with
// question_number so it isn't always in the same place.
export function build_blank_question(sentence, keywords, question_number) {
  const answer_word = pick_answer_word(sentence, keywords);
  if (!answer_word) return null;

  const sentence_lowercase = sentence.toLowerCase();
  const distractor_pool = keywords.filter(
    (keyword) => !shares_word_stem(keyword, answer_word) && !sentence_lowercase.includes(keyword),
  );
  if (distractor_pool.length < DISTRACTOR_COUNT) return null;

  const rotation = question_number % distractor_pool.length;
  const distractors = [...distractor_pool.slice(rotation), ...distractor_pool.slice(0, rotation)].slice(0, DISTRACTOR_COUNT);
  const correct_index = question_number % QUIZ_CHOICE_COUNT;
  const choices = [...distractors];
  choices.splice(correct_index, 0, answer_word);

  return {
    question: `Fill in the blank: "${blank_out_word(sentence, answer_word)}"`,
    choices,
    correct_index,
    explanation: `From your resources: "${sentence}"`,
  };
}

export function build_mock_quiz({ topic, source_text, question_count }) {
  assert_has_sources(source_text);
  const keywords = find_keywords(strip_source_labels(source_text), QUIZ_KEYWORD_POOL_SIZE);
  const questions = [];
  for (const { sentence } of rank_sentences(source_text, topic)) {
    if (questions.length === question_count) break;
    const quiz_question = build_blank_question(sentence, keywords, questions.length);
    if (quiz_question) questions.push(quiz_question);
  }

  if (questions.length === 0) {
    throw create_http_error(
      HTTP_STATUS.unprocessable,
      "There isn't enough text in this skill's resources to make a quiz yet. Add more and try again.",
    );
  }
  return { questions };
}

// "photosynthesis" -> "Photosynthesis"
export function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// The most frequent meaningful words become topics, each summarized by the first sentence
// that uses it, skipping names the skill already has. No parent links: the mock can't tell
// which topic is broader. Breaking a topic into subtopics works the same way, on that
// topic's own material, also skipping the words of the topic's own name.
export function build_mock_topics({ source_text, max_topics, existing_topics = [], focus_topic = null }) {
  assert_has_sources(source_text);
  const plain_text = strip_source_labels(source_text);
  const sentences = split_into_sentences(plain_text);
  const existing_names = new Set([
    ...existing_topics.map((topic_name) => topic_name.toLowerCase()),
    ...(focus_topic ? get_topic_words(focus_topic.topic) : []),
  ]);
  const new_keywords = find_keywords(plain_text, max_topics + existing_names.size)
    .filter((keyword) => !existing_names.has(keyword))
    .slice(0, max_topics);
  const topics = new_keywords.map((keyword) => ({
    topic: capitalize(keyword),
    summary: sentences.find((sentence) => sentence.toLowerCase().includes(keyword)) ?? '',
    parent_topic: '',
  }));
  if (topics.length === 0) {
    throw create_http_error(HTTP_STATUS.unprocessable, "There isn't enough text in this skill's resources to find topics yet.");
  }
  return { topics };
}

export function create_mock_ai_provider() {
  return {
    name: 'mock',
    generate_notes: async (notes_request) => build_mock_notes(notes_request),
    generate_quiz: async (quiz_request) => build_mock_quiz(quiz_request),
    generate_topics: async (topics_request) => build_mock_topics(topics_request),
    plan_assistant_step: async (step_request) => build_mock_assistant_step(step_request),
    reply_as_ai_student: async (reply_request) => build_mock_ai_student_reply(reply_request),
    take_quiz_as_ai_student: async (quiz_request) => build_mock_ai_student_answers(quiz_request),
    generate_lesson: async (lesson_request) => build_mock_lesson(lesson_request),
    reteach_lesson_step: async (reteach_request) => build_mock_reteach(reteach_request),
    order_learning_path: async (path_request) => build_mock_learning_path(path_request),
    generate_practice: async (practice_request) => build_mock_practice(practice_request),
    check_practice_answer: async (check_request) => build_mock_practice_check(check_request),
    guide_reading_section: async (guide_request) => build_mock_reading_guide(guide_request),
    explain_text: async (explain_request) => build_mock_explanation(explain_request),
    generate_glossary: async (glossary_request) => build_mock_glossary(glossary_request),
    build_widget_app: async (app_request) => build_mock_widget_app(app_request),
  };
}
