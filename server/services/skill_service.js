import { randomUUID } from 'node:crypto';
import { DEFAULT_SKILL_COLOR, HTTP_STATUS, MASTERY_THRESHOLDS } from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { remove_stored_file } from './storage_service.js';

// resource_count lets the client tell whether notes and quizzes can be made yet; the topic
// counts let the week planner give more time to skills with weak or untested topics.
const SKILL_SELECT = `
  SELECT skills.id, skills.name, skills.color, skills.created_at,
         (SELECT count(*) FROM resources WHERE resources.skill_id = skills.id) AS resource_count,
         (SELECT count(*) FROM skill_nodes WHERE skill_nodes.skill_id = skills.id) AS topic_count,
         (SELECT count(*) FROM skill_nodes WHERE skill_nodes.skill_id = skills.id
            AND skill_nodes.mastery_score < ${MASTERY_THRESHOLDS.developing}) AS weak_topic_count,
         (SELECT count(*) FROM skill_nodes WHERE skill_nodes.skill_id = skills.id
            AND skill_nodes.mastery_score IS NULL) AS untested_topic_count
  FROM skills`;

export function list_skills(database, user_id) {
  return database.prepare(`${SKILL_SELECT} WHERE skills.user_id = ? ORDER BY skills.created_at`).all(user_id);
}

// Returns the skill if it belongs to the student. Someone else's skill gets the same 404
// as a missing one, so ids can't be probed.
export function get_owned_skill(database, user_id, skill_id) {
  const skill = database.prepare(`${SKILL_SELECT} WHERE skills.id = ? AND skills.user_id = ?`).get(skill_id, user_id);
  if (!skill) throw create_http_error(HTTP_STATUS.not_found, 'Skill not found');
  return skill;
}

// Skill names are unique per student, ignoring letter case.
export function assert_skill_name_available(database, user_id, name, excluded_skill_id = null) {
  const existing_skill = database
    .prepare('SELECT 1 FROM skills WHERE user_id = ? AND name = ? COLLATE NOCASE AND id IS NOT ?')
    .get(user_id, name, excluded_skill_id);
  if (existing_skill) {
    throw create_http_error(HTTP_STATUS.conflict, 'You already have a skill with that name', {
      field_errors: { name: 'You already have a skill with that name' },
    });
  }
}

export function create_skill(database, user_id, { name, color = DEFAULT_SKILL_COLOR }) {
  assert_skill_name_available(database, user_id, name);
  const skill_id = randomUUID();
  database.prepare('INSERT INTO skills (id, user_id, name, color) VALUES (?, ?, ?, ?)').run(skill_id, user_id, name, color);
  return get_owned_skill(database, user_id, skill_id);
}

// skill_updates holds validated name and/or color. Column names come only from that
// fixed pair, never from the request.
export function update_skill(database, user_id, skill_id, skill_updates) {
  get_owned_skill(database, user_id, skill_id);
  if (skill_updates.name !== undefined) assert_skill_name_available(database, user_id, skill_updates.name, skill_id);

  const set_clause = Object.keys(skill_updates)
    .map((column_name) => `${column_name} = ?`)
    .join(', ');
  database.prepare(`UPDATE skills SET ${set_clause} WHERE id = ?`).run(...Object.values(skill_updates), skill_id);
  return get_owned_skill(database, user_id, skill_id);
}

// Deleting a skill cascades to its resources, notes, topics and quizzes in the database;
// the uploaded files are removed here because the filesystem does not cascade.
export async function delete_skill(database, uploads_path, user_id, skill_id) {
  get_owned_skill(database, user_id, skill_id);
  const stored_files = database
    .prepare('SELECT file_path FROM resources WHERE skill_id = ? AND file_path IS NOT NULL')
    .all(skill_id);
  database.prepare('DELETE FROM skills WHERE id = ?').run(skill_id);
  await Promise.all(stored_files.map((stored_file) => remove_stored_file(uploads_path, stored_file.file_path)));
}
