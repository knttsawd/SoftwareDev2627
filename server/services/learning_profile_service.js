import { LEARNING_QUIZ_QUESTIONS } from '../config/learning_quiz.js';
import { get_account } from './account_service.js';

const SESSION_LENGTH_QUESTION_ID = 'session_length';

// Looks up the work block timer lengths that match the student's session_length answer.
export function get_timer_preferences(learning_profile, questions = LEARNING_QUIZ_QUESTIONS) {
  const session_question = questions.find((question) => question.id === SESSION_LENGTH_QUESTION_ID);
  const chosen_option = session_question.options.find(
    (option) => option.value === learning_profile[SESSION_LENGTH_QUESTION_ID],
  );
  return { work_minutes: chosen_option.work_minutes, break_minutes: chosen_option.break_minutes };
}

// The student's answer to "How do you learn best?", or null if they skipped the quiz.
export function get_learning_style(database, user_id) {
  const user_row = database.prepare('SELECT learning_profile FROM users WHERE id = ?').get(user_id);
  return JSON.parse(user_row?.learning_profile ?? '{}').learning_style ?? null;
}

// Saves validated quiz answers and sets the work block timer to match them.
// Returns the updated account.
export function save_learning_profile(database, user_id, learning_profile) {
  const { work_minutes, break_minutes } = get_timer_preferences(learning_profile);
  database
    .prepare('UPDATE users SET learning_profile = ?, work_minutes = ?, break_minutes = ? WHERE id = ?')
    .run(JSON.stringify(learning_profile), work_minutes, break_minutes, user_id);
  return get_account(database, user_id);
}
