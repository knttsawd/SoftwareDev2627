import { send_authed_request } from './auth_service.js';

// AI study notes: [{ id, topic, content (Markdown), created_at }], newest first.
export async function fetch_notes(skill_id) {
  return send_authed_request(`/skills/${skill_id}/notes`);
}

export async function generate_notes(skill_id, topic) {
  return send_authed_request(`/skills/${skill_id}/notes`, { method: 'POST', body: { topic } });
}

export async function delete_note(note_id) {
  return send_authed_request(`/notes/${note_id}`, { method: 'DELETE' });
}

// AI quizzes: [{ id, topic, question_count, created_at }], newest first.
export async function fetch_quizzes(skill_id) {
  return send_authed_request(`/skills/${skill_id}/quizzes`);
}

// quiz_details: { topic_id, question_count } for a skill-map topic, or { topic,
// question_count } for a typed one. Returns the quiz without its answers.
export async function generate_quiz(skill_id, quiz_details) {
  return send_authed_request(`/skills/${skill_id}/quizzes`, { method: 'POST', body: quiz_details });
}

// Instant feedback on one answer: { is_correct, correct_index, explanation }. Saves nothing.
export async function check_answer(quiz_id, question_index, answer_index) {
  return send_authed_request(`/quizzes/${quiz_id}/check`, { method: 'POST', body: { question_index, answer_index } });
}

// answers: one choice index (or null if skipped) per question.
// Returns { result, question_results, topic } with the grade and the updated map topic.
export async function submit_quiz_answers(quiz_id, answers) {
  return send_authed_request(`/quizzes/${quiz_id}/results`, { method: 'POST', body: { answers } });
}

// The student's recent results in a skill: [{ id, quiz_id, topic, score, correct_count, total_count, completed_at }].
export async function fetch_recent_results(skill_id) {
  return send_authed_request(`/skills/${skill_id}/results`);
}

// One quiz's questions and choices (answers stay on the server).
export async function fetch_quiz(quiz_id) {
  return send_authed_request(`/quizzes/${quiz_id}`);
}

export async function delete_quiz(quiz_id) {
  return send_authed_request(`/quizzes/${quiz_id}`, { method: 'DELETE' });
}

// { ai_provider, transcription_provider }: "mock" means practice mode with no real AI.
export async function fetch_ai_status() {
  return send_authed_request('/ai/status');
}
