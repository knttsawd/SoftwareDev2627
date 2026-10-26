import { DEFAULT_AI_STUDENT_REASON } from './ai_student_answers.js';
import { count_topic_matches, find_keywords, get_topic_words, split_into_sentences, split_into_words } from './text_analysis.js';

// The practice-mode AI student, used when AI_PROVIDER=mock. It really does know only what
// it's taught, because all it does is look for the teacher's own words: replies ask about a
// word the teacher used, and quiz answers pick the choice the lesson mentions most.

// Explanations shorter than this get "tell me more" instead of a question about a word.
const MIN_EXPLANATION_WORDS = 8;
const KEYWORD_LOOKUP_COUNT = 5;
// One of these follows each explanation, in turn, so the replies don't all sound the same.
const FOLLOW_UP_QUESTIONS = [
  (keyword) => `What does "${keyword}" mean?`,
  (keyword) => `Can you give me an example of ${keyword}?`,
  (keyword) => `Why does ${keyword} matter?`,
  (keyword) => `How does ${keyword} fit with what you told me before?`,
];

// Every explanation the teacher gave, as one text.
export function get_teacher_text(lesson_messages) {
  return lesson_messages
    .filter((lesson_message) => lesson_message.role === 'teacher')
    .map((lesson_message) => lesson_message.content)
    .join('\n');
}

// The word from the latest explanation to ask about: the longest of its most frequent
// meaningful words (long words are usually the subject's own terms, like "chlorophyll"),
// skipping words from the topic's name. null when there's none.
export function pick_word_to_ask_about(explanation, topic) {
  const topic_words = new Set(get_topic_words(topic));
  const candidates = find_keywords(explanation, KEYWORD_LOOKUP_COUNT).filter((keyword) => !topic_words.has(keyword));
  return candidates.reduce((longest, keyword) => (keyword.length > (longest?.length ?? 0) ? keyword : longest), null);
}

// The AI student's reply to the latest explanation.
export function build_mock_ai_student_reply({ topic, lesson_messages }) {
  const teacher_messages = lesson_messages.filter((lesson_message) => lesson_message.role === 'teacher');
  const latest_explanation = teacher_messages.at(-1)?.content ?? '';
  const keyword = pick_word_to_ask_about(latest_explanation, topic);
  if (split_into_words(latest_explanation).length < MIN_EXPLANATION_WORDS || !keyword) {
    return { reply: `Can you tell me more? I still don't know much about ${topic}.` };
  }
  const follow_up = FOLLOW_UP_QUESTIONS[(teacher_messages.length - 1) % FOLLOW_UP_QUESTIONS.length];
  return { reply: `Okay, I think I'm starting to get it. ${follow_up(keyword)}` };
}

// The index of the choice the lesson mentions most, or null when none is mentioned or two
// are mentioned equally (the AI student won't guess).
export function pick_taught_choice(choices, teacher_text) {
  const scores = choices.map((choice) => count_topic_matches(teacher_text, get_topic_words(choice)));
  const best_score = Math.max(...scores);
  if (best_score === 0 || scores.filter((score) => score === best_score).length > 1) return null;
  return scores.indexOf(best_score);
}

// The first sentence of the lesson that mentions the choice, to quote as the reason.
export function find_teaching_sentence(teacher_text, choice) {
  const choice_words = get_topic_words(choice);
  return split_into_sentences(teacher_text).find((sentence) => count_topic_matches(sentence, choice_words) > 0) ?? null;
}

// The AI student's quiz answers: { answers, reasons, feedback }, the same shape the real
// providers give after normalize_ai_student_answers.
export function build_mock_ai_student_answers({ lesson_messages, questions }) {
  const teacher_text = get_teacher_text(lesson_messages);
  const answers = questions.map((quiz_question) => pick_taught_choice(quiz_question.choices, teacher_text));
  const reasons = answers.map((choice_index, question_index) => {
    if (choice_index === null) return DEFAULT_AI_STUDENT_REASON;
    const teaching_sentence = find_teaching_sentence(teacher_text, questions[question_index].choices[choice_index]);
    return teaching_sentence ? `You told me: "${teaching_sentence}"` : 'You mentioned it in the lesson.';
  });
  const answered_count = answers.filter((choice_index) => choice_index !== null).length;
  const feedback =
    `I could answer ${answered_count} of ${questions.length} questions from what you taught me. ` +
    "Explain the parts I didn't know, and I'll do better next time.";
  return { answers, reasons, feedback };
}
