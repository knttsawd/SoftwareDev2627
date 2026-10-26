import { send_authed_request } from './auth_service.js';

// "Teach the AI student" lessons. A teach session is
// { id, skill_id, topic_id, topic, status ("teaching" | "quiz" | "done"), lesson_messages:
//   [{ role: "teacher" | "ai_student", content }], teacher_message_count, max_teacher_messages,
//   quiz (while status is "quiz"), results (once "done") }.

// Lesson summaries, newest first: one skill's, or every skill's when skill_id is left out.
export async function fetch_teach_sessions(skill_id) {
  return send_authed_request(skill_id ? `/skills/${skill_id}/teach-sessions` : '/teach-sessions');
}

// topic_details: { topic_id } for a map topic, or { topic } for a typed one.
export async function start_teach_session(skill_id, topic_details) {
  return send_authed_request(`/skills/${skill_id}/teach-sessions`, { method: 'POST', body: topic_details });
}

export async function fetch_teach_session(session_id) {
  return send_authed_request(`/teach-sessions/${session_id}`);
}

// Sends one explanation; the session comes back with the AI student's reply.
export async function send_teaching_message(session_id, message) {
  return send_authed_request(`/teach-sessions/${session_id}/messages`, { method: 'POST', body: { message } });
}

// Ends the lesson. The session comes back with the quiz both of them take.
export async function start_lesson_quiz(session_id, question_count) {
  return send_authed_request(`/teach-sessions/${session_id}/quiz`, { method: 'POST', body: { question_count } });
}

// answers: one choice index (or null) per question. Returns { teach_session, topic }.
export async function submit_lesson_answers(session_id, answers) {
  return send_authed_request(`/teach-sessions/${session_id}/results`, { method: 'POST', body: { answers } });
}

export async function delete_teach_session(session_id) {
  return send_authed_request(`/teach-sessions/${session_id}`, { method: 'DELETE' });
}
