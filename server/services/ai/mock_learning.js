import { HTTP_STATUS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { to_lesson_check } from './learning_outputs.js';
import {
  assert_has_sources,
  blank_out_word,
  build_blank_question,
  capitalize,
  rank_sentences,
  strip_source_labels,
} from './mock_ai_provider.js';
import { count_topic_matches, find_keywords, get_topic_words, split_into_sentences, split_into_words } from './text_analysis.js';

// Practice mode's versions of the learning features. Like the rest of the mock AI it
// understands nothing: lessons, practice problems, reading guides and key terms are built
// from sentences in the student's resources, and check questions are fill-in-the-blanks.

const MOCK_KEYWORD_POOL_SIZE = 40;
const SENTENCES_PER_STEP = 3;
const RETEACH_SENTENCE_COUNT = 2;
const GUIDE_POINT_COUNT = 2;
const GUIDE_TERM_COUNT = 3;
const EXPLANATION_SENTENCE_COUNT = 3;
export const MOCK_LEARNING_NOTICE =
  '> Practice mode: this is built from sentences in your resources. Set AI_PROVIDER in server/.env for real teaching.';

// The keywords that blank questions are made from.
function find_mock_keywords(source_text) {
  return find_keywords(strip_source_labels(source_text), MOCK_KEYWORD_POOL_SIZE);
}

// "- first\n- second"
function to_bullets(lines) {
  return lines.map((line) => `- ${line}`).join('\n');
}

// One lesson step from a few sentences: the first that makes a fill-in-the-blank question
// becomes the check, its answer word the title; the next sentence explains more and the
// one after is the example. null when no sentence makes a question.
export function build_mock_lesson_step(sentences, keywords, step_number) {
  for (const sentence of sentences) {
    const check = build_blank_question(sentence, keywords, step_number);
    if (!check) continue;
    const other_sentences = sentences.filter((other_sentence) => other_sentence !== sentence);
    return {
      title: capitalize(check.choices[check.correct_index]),
      explanation_markdown: [sentence, ...other_sentences.slice(0, 1)].join(' '),
      example_markdown: other_sentences[1] ? `From your resources: ${other_sentences[1]}` : '',
      checks: [to_lesson_check(check)],
    };
  }
  return null;
}

// A lesson of up to step_count steps from the sentences that best match the topic, in
// reading order.
export function build_mock_lesson({ topic, source_text, step_count }) {
  assert_has_sources(source_text);
  const keywords = find_mock_keywords(source_text);
  const sentences = rank_sentences(source_text, topic)
    .slice(0, step_count * SENTENCES_PER_STEP)
    .sort((first, second) => first.reading_order - second.reading_order)
    .map(({ sentence }) => sentence);

  const steps = [];
  for (let start = 0; start < sentences.length && steps.length < step_count; start += SENTENCES_PER_STEP) {
    const step = build_mock_lesson_step(sentences.slice(start, start + SENTENCES_PER_STEP), keywords, steps.length);
    if (step) steps.push(step);
  }
  if (steps.length === 0) {
    throw create_http_error(HTTP_STATUS.unprocessable, "There isn't enough text in your resources to teach this yet. Add more and try again.");
  }
  steps[0].explanation_markdown = `${MOCK_LEARNING_NOTICE}\n\n${steps[0].explanation_markdown}`;
  return { steps };
}

// After a missed check: the right answer, other sentences that use it, and a new
// fill-in-the-blank question that differs from the missed one.
export function build_mock_reteach({ step, missed_check, source_text }) {
  assert_has_sources(source_text);
  const keywords = find_mock_keywords(source_text);
  const related_sentences = rank_sentences(source_text, `${missed_check.correct_choice} ${step.title}`)
    .filter((ranked_sentence) => ranked_sentence.score > 0)
    .map(({ sentence }) => sentence);
  const fresh_sentences = related_sentences.filter((sentence) => !step.explanation_markdown.includes(sentence));

  for (const [sentence_number, sentence] of [...fresh_sentences, ...related_sentences].entries()) {
    const check = build_blank_question(sentence, keywords, sentence_number + 1);
    if (!check || check.question === missed_check.question) continue;
    const reteach_lines = [MOCK_LEARNING_NOTICE, `The answer was **${missed_check.correct_choice}**.`];
    if (fresh_sentences.length > 0) {
      reteach_lines.push(`Here's what else your resources say about it:\n${to_bullets(fresh_sentences.slice(0, RETEACH_SENTENCE_COUNT))}`);
    }
    return { reteach_markdown: reteach_lines.join('\n\n'), check };
  }
  throw create_http_error(
    HTTP_STATUS.unprocessable,
    "Practice mode couldn't find another way to ask about this. Move on to the next step, or switch on a real AI.",
  );
}

// Practice mode can't judge what builds on what, so the path keeps the order it's given
// (the map's own order, broader topics first).
export function build_mock_learning_path({ topics }) {
  return { steps: Array.from(topics.keys(), (index) => ({ index, reason: '' })) };
}

// A worked example from one fill-in-the-blank: where the sentence is, then the answer.
export function build_mock_worked_example({ sentence, blank_question }) {
  const answer = blank_question.choices[blank_question.correct_index];
  return {
    problem: blank_question.question,
    steps: [
      'Look for the words around the blank in your resources.',
      `They come from this sentence: "${sentence}"`,
      `So the missing word is "${answer}".`,
    ],
    answer,
  };
}

// A problem with three hints, each giving more away: the answer's first letter and length,
// another sentence that uses it (blanked), then the four choices.
export function build_mock_problem({ sentence, blank_question }, all_sentences) {
  const answer = blank_question.choices[blank_question.correct_index];
  const other_sentence = all_sentences.find(
    (candidate) => candidate !== sentence && split_into_words(candidate).includes(answer),
  );
  return {
    problem: blank_question.question,
    hints: [
      `It starts with "${answer.charAt(0)}" and has ${answer.length} letters.`,
      other_sentence
        ? `Your resources also say: "${blank_out_word(other_sentence, answer)}"`
        : 'It is a word your resources use often.',
      `It's one of: ${blank_question.choices.join(', ')}.`,
    ],
    solution_steps: [`The full sentence in your resources is: "${sentence}"`],
    answer,
  };
}

// A worked example and up to problem_count problems, all fill-in-the-blanks on the
// sentences that best match the topic.
export function build_mock_practice({ topic, source_text, problem_count }) {
  assert_has_sources(source_text);
  const keywords = find_mock_keywords(source_text);
  const exercises = [];
  for (const { sentence } of rank_sentences(source_text, topic)) {
    if (exercises.length === problem_count + 1) break;
    const blank_question = build_blank_question(sentence, keywords, exercises.length);
    if (blank_question) exercises.push({ sentence, blank_question });
  }
  if (exercises.length < 2) {
    throw create_http_error(HTTP_STATUS.unprocessable, "There isn't enough text in your resources to make practice problems yet.");
  }
  const all_sentences = split_into_sentences(strip_source_labels(source_text));
  const [example_exercise, ...problem_exercises] = exercises;
  return {
    worked_example: build_mock_worked_example(example_exercise),
    problems: problem_exercises.map((exercise) => build_mock_problem(exercise, all_sentences)),
  };
}

// Lowercase letters and digits only, so "Glucose." matches "glucose".
export function normalize_answer_text(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Correct when the typed answer is the answer word, or contains it as a whole word.
export function build_mock_practice_check({ answer, student_answer }) {
  const expected_answer = normalize_answer_text(answer);
  const given_answer = normalize_answer_text(student_answer);
  const is_correct = given_answer === expected_answer || given_answer.split(' ').includes(expected_answer);
  return {
    is_correct,
    feedback: is_correct
      ? 'That matches the answer in your resources. Well done!'
      : 'Not quite yet. Try a hint, or look back at that part of your resources.',
  };
}

// The section's most important sentences, its key words and a question to think about.
export function build_mock_reading_guide({ section_text }) {
  const key_words = find_keywords(section_text, GUIDE_TERM_COUNT);
  const key_points = rank_sentences(section_text, key_words.join(' '))
    .slice(0, GUIDE_POINT_COUNT)
    .sort((first, second) => first.reading_order - second.reading_order)
    .map(({ sentence }) => sentence);
  const explanation_lines = [MOCK_LEARNING_NOTICE];
  explanation_lines.push(
    key_points.length > 0 ? `The main points of this section:\n${to_bullets(key_points)}` : 'This section is short, so read it closely.',
  );
  if (key_words.length > 0) explanation_lines.push(`Key words to look out for: ${key_words.join(', ')}.`);
  return {
    explanation_markdown: explanation_lines.join('\n\n'),
    think_about:
      key_words.length > 0
        ? `How would you explain "${key_words[0]}" to a friend, in your own words?`
        : 'What is the most important idea in this section, in your own words?',
  };
}

// Practice mode can't rewrite an explanation, so it quotes the other sentences in the
// resources that are about the same thing.
export function build_mock_explanation({ text, context_text }) {
  const matching_sentences = context_text
    ? rank_sentences(context_text, text)
        .filter((ranked_sentence) => ranked_sentence.score > 0 && !text.includes(ranked_sentence.sentence))
        .slice(0, EXPLANATION_SENTENCE_COUNT)
        .map(({ sentence }) => sentence)
    : [];
  if (matching_sentences.length === 0) {
    return {
      explanation_markdown:
        "Practice mode can only quote your resources, and they don't say more about this. Switch on a real AI in server/.env to have it explained another way.",
    };
  }
  return {
    explanation_markdown: [
      "> Practice mode can't rewrite explanations, so here's what else your resources say about this.",
      to_bullets(matching_sentences),
    ].join('\n\n'),
  };
}

// The topic name whose words appear most in text, or '' when none do.
export function pick_matching_topic(text, topic_names) {
  let best_topic = '';
  let best_score = 0;
  for (const topic_name of topic_names) {
    const score = count_topic_matches(text, get_topic_words(topic_name));
    if (score > best_score) {
      best_topic = topic_name;
      best_score = score;
    }
  }
  return best_topic;
}

// The most frequent words in the resources that the student doesn't have yet, each defined
// by the first sentence that uses it and matched to the topic it mentions most.
export function build_mock_glossary({ source_text, topics, existing_terms, max_terms }) {
  assert_has_sources(source_text);
  const plain_text = strip_source_labels(source_text);
  const sentences = split_into_sentences(plain_text);
  const existing_names = new Set(existing_terms.map((term) => term.toLowerCase()));
  const terms = [];
  for (const keyword of find_keywords(plain_text, MOCK_KEYWORD_POOL_SIZE + existing_names.size)) {
    if (terms.length === max_terms) break;
    const definition = sentences.find((sentence) => split_into_words(sentence).includes(keyword));
    if (existing_names.has(keyword) || !definition) continue;
    terms.push({ term: keyword, definition, topic: pick_matching_topic(`${keyword} ${definition}`, topics) });
  }
  if (terms.length === 0) {
    throw create_http_error(HTTP_STATUS.unprocessable, 'Practice mode found no new key terms in your resources.');
  }
  return { terms };
}
