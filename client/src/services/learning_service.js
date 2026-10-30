import { send_authed_request } from './auth_service.js';

// The learning features. Shapes are described in server/services/: guided_lesson_service.js,
// learning_path_service.js, practice_service.js, reading_service.js and glossary_service.js.

// Learning path: { has_path, created_at, steps, new_topic_count, topic_count }.
export async function fetch_learning_path(skill_id) {
  return send_authed_request(`/skills/${skill_id}/learning-path`);
}

// Asks the AI to order the skill's topics (finding them first if there are none).
export async function build_learning_path(skill_id) {
  return send_authed_request(`/skills/${skill_id}/learning-path`, { method: 'POST' });
}

// Guided lessons. A lesson is { id, skill_id, topic_id, topic, step_count, current_step,
// is_complete, steps: [{ title, explanation_markdown, example_markdown, checks }],
// can_reteach, first_try_correct }.
export async function fetch_guided_lessons(skill_id) {
  return send_authed_request(`/skills/${skill_id}/guided-lessons`);
}

// lesson_details: { topic_id } or { topic }, plus step_count.
export async function start_guided_lesson(skill_id, lesson_details) {
  return send_authed_request(`/skills/${skill_id}/guided-lessons`, { method: 'POST', body: lesson_details });
}

export async function fetch_guided_lesson(lesson_id) {
  return send_authed_request(`/guided-lessons/${lesson_id}`);
}

export async function answer_lesson_check(lesson_id, choice_index) {
  return send_authed_request(`/guided-lessons/${lesson_id}/answer`, { method: 'POST', body: { choice_index } });
}

// After a wrong answer: the step explained another way, with a new question.
export async function reteach_lesson_step(lesson_id) {
  return send_authed_request(`/guided-lessons/${lesson_id}/reteach`, { method: 'POST' });
}

export async function go_to_next_step(lesson_id) {
  return send_authed_request(`/guided-lessons/${lesson_id}/next`, { method: 'POST' });
}

export async function delete_guided_lesson(lesson_id) {
  return send_authed_request(`/guided-lessons/${lesson_id}`, { method: 'DELETE' });
}

// Practice with hints. A practice set is { id, skill_id, topic_id, topic, worked_example:
// { problem, steps, answer }, problems: [{ problem, hints, hint_count, attempts, is_solved,
// is_solution_shown, solution_steps, answer }], solved_count }.
export async function fetch_practice_sets(skill_id) {
  return send_authed_request(`/skills/${skill_id}/practice-sets`);
}

// practice_details: { topic_id } or { topic }, plus problem_count.
export async function create_practice_set(skill_id, practice_details) {
  return send_authed_request(`/skills/${skill_id}/practice-sets`, { method: 'POST', body: practice_details });
}

export async function fetch_practice_set(practice_id) {
  return send_authed_request(`/practice-sets/${practice_id}`);
}

export async function show_practice_hint(practice_id, problem_index) {
  return send_authed_request(`/practice-sets/${practice_id}/problems/${problem_index}/hint`, { method: 'POST' });
}

export async function show_practice_solution(practice_id, problem_index) {
  return send_authed_request(`/practice-sets/${practice_id}/problems/${problem_index}/solution`, { method: 'POST' });
}

// Returns { practice_set, attempt: { answer, is_correct, feedback } }.
export async function check_practice_answer(practice_id, problem_index, answer) {
  return send_authed_request(`/practice-sets/${practice_id}/problems/${problem_index}/check`, {
    method: 'POST',
    body: { answer },
  });
}

export async function delete_practice_set(practice_id) {
  return send_authed_request(`/practice-sets/${practice_id}`, { method: 'DELETE' });
}

// Active reading. The list is [{ resource_id, title, resource_type, topic_id,
// section_count, position }].
export async function fetch_reading_list(skill_id) {
  return send_authed_request(`/skills/${skill_id}/reading`);
}

// { resource, sections: [{ index, title, character_count, has_guide }], position }
export async function fetch_reading(resource_id) {
  return send_authed_request(`/resources/${resource_id}/reading`);
}

// { index, title, text, guide: { explanation_markdown, think_about } | null }
export async function fetch_reading_section(resource_id, section_index) {
  return send_authed_request(`/resources/${resource_id}/reading/sections/${section_index}`);
}

// The section with its guide, which the AI writes the first time it's asked for.
export async function guide_reading_section(resource_id, section_index) {
  return send_authed_request(`/resources/${resource_id}/reading/sections/${section_index}/guide`, { method: 'POST' });
}

export async function save_reading_position(resource_id, section_index) {
  return send_authed_request(`/resources/${resource_id}/reading/position`, { method: 'PUT', body: { section_index } });
}

// Returns { explanation_markdown }.
export async function explain_reading_passage(resource_id, section_index, passage) {
  return send_authed_request(`/resources/${resource_id}/reading/explain`, { method: 'POST', body: { section_index, passage } });
}

// Key terms: [{ id, skill_id, topic_id, term, definition, created_at }], alphabetical.
export async function fetch_glossary(skill_id) {
  return send_authed_request(`/skills/${skill_id}/glossary`);
}

// term_details: { term, definition, topic_id? }.
export async function add_glossary_term(skill_id, term_details) {
  return send_authed_request(`/skills/${skill_id}/glossary`, { method: 'POST', body: term_details });
}

// Returns { added_count, terms }.
export async function generate_glossary(skill_id) {
  return send_authed_request(`/skills/${skill_id}/glossary/generate`, { method: 'POST' });
}

export async function delete_glossary_term(skill_id, term_id) {
  return send_authed_request(`/skills/${skill_id}/glossary/${term_id}`, { method: 'DELETE' });
}

// "Explain another way": explain_details is { text, style, topic_id? }, where style is
// "simpler", "analogy", "example" or "deeper". Returns { explanation_markdown }.
export async function explain_another_way(skill_id, explain_details) {
  return send_authed_request(`/skills/${skill_id}/explain`, { method: 'POST', body: explain_details });
}
