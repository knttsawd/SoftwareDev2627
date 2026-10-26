import { LEARNING_QUIZ_QUESTIONS } from '../config/learning_quiz.js';

// Returns the set of allowed option values for a single or multiple choice question.
function get_option_values(question) {
  return new Set(question.options.map((option) => option.value));
}

// Checks one answer against its question. Returns an error message, or null when valid.
export function validate_quiz_answer(question, answer) {
  if (question.type === 'single') {
    return get_option_values(question).has(answer) ? null : 'Choose one option';
  }

  if (question.type === 'multiple') {
    if (!Array.isArray(answer) || answer.length < question.min_choices) {
      return `Choose at least ${question.min_choices}`;
    }
    const option_values = get_option_values(question);
    if (!answer.every((chosen_value) => option_values.has(chosen_value))) return 'Choose from the options shown';
    if (new Set(answer).size > question.max_choices) return `Choose up to ${question.max_choices}`;
    return null;
  }

  if (answer === undefined || answer === null || answer === '') {
    return question.required === false ? null : 'This answer is required';
  }
  if (typeof answer !== 'string') return 'Enter text';
  if (answer.trim().length > question.max_length) return `Keep it under ${question.max_length} characters`;
  return null;
}

// Tidies a valid answer for storage: duplicates removed from lists, text trimmed,
// a skipped optional text answer stored as ''.
export function clean_quiz_answer(question, answer) {
  if (question.type === 'multiple') return [...new Set(answer)];
  if (question.type === 'text') return typeof answer === 'string' ? answer.trim() : '';
  return answer;
}

// Validates a full set of quiz answers keyed by question id. Returns { field_errors, values };
// values holds every question's cleaned answer and ignores keys that are not questions.
export function validate_learning_profile(answers, questions = LEARNING_QUIZ_QUESTIONS) {
  const field_errors = {};
  const values = {};
  for (const question of questions) {
    const answer = answers?.[question.id];
    const error_message = validate_quiz_answer(question, answer);
    if (error_message) {
      field_errors[question.id] = error_message;
    } else {
      values[question.id] = clean_quiz_answer(question, answer);
    }
  }
  return { field_errors, values };
}
