import { HTTP_STATUS, QUIZ_CHOICE_COUNT } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';

// True when value is a string with something other than spaces in it.
function is_filled_text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Checks one AI-written question: question text, exactly QUIZ_CHOICE_COUNT different
// non-empty choices, and a correct_index pointing at one of them.
export function is_valid_quiz_question(candidate) {
  if (!candidate || !is_filled_text(candidate.question) || !Array.isArray(candidate.choices)) return false;
  if (candidate.choices.length !== QUIZ_CHOICE_COUNT || !candidate.choices.every(is_filled_text)) return false;
  if (new Set(candidate.choices.map((choice) => choice.trim().toLowerCase())).size !== QUIZ_CHOICE_COUNT) return false;
  return Number.isInteger(candidate.correct_index) && candidate.correct_index >= 0 && candidate.correct_index < QUIZ_CHOICE_COUNT;
}

// Keeps the valid questions (trimmed, at most max_count) from whatever the AI returned,
// so one malformed question doesn't break a whole quiz. Throws a 502 if none are usable.
export function normalize_quiz_questions(raw_questions, max_count) {
  const usable_questions = (Array.isArray(raw_questions) ? raw_questions : [])
    .filter(is_valid_quiz_question)
    .slice(0, max_count)
    .map((quiz_question) => ({
      question: quiz_question.question.trim(),
      choices: quiz_question.choices.map((choice) => choice.trim()),
      correct_index: quiz_question.correct_index,
      explanation: is_filled_text(quiz_question.explanation) ? quiz_question.explanation.trim() : '',
    }));

  if (usable_questions.length === 0) {
    throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI did not return a usable quiz. Please try again.');
  }
  return usable_questions;
}
