import { api_request } from './api_client.js';
import { send_authed_request } from './auth_service.js';

// Loads the learning style quiz questions. The server holds the only copy of them.
export async function fetch_learning_quiz() {
  const { questions } = await api_request('/learning-quiz');
  return questions;
}

// Saves the student's answers and returns the updated account.
export async function save_learning_profile(answers) {
  return send_authed_request('/account/learning-profile', { method: 'PUT', body: { answers } });
}

// A student who skipped step 2 of sign-up has an empty learning_profile.
export function has_learning_profile(account) {
  return Object.keys(account?.learning_profile ?? {}).length > 0;
}

// Starting answers for the quiz form: the student's saved answers when retaking it,
// otherwise blanks (an empty list for multiple choice, '' for everything else).
export function build_initial_answers(questions, saved_answers = {}) {
  return Object.fromEntries(
    questions.map((question) => [question.id, saved_answers[question.id] ?? (question.type === 'multiple' ? [] : '')]),
  );
}

// Adds a checkbox value to a list of choices, or removes it if it is already there.
export function toggle_choice(chosen_values, value) {
  return chosen_values.includes(value)
    ? chosen_values.filter((chosen_value) => chosen_value !== value)
    : [...chosen_values, value];
}
