import { HTTP_STATUS } from '../config/constants.js';
import { select_overview_text } from './ai/source_selection.js';
import { create_http_error } from './http_error.js';
import { remove_stored_file } from './storage_service.js';

// The list view leaves out the (possibly huge) extracted text and reports its length instead.
// topic_id is the skill-map topic (unit) the resource belongs to, or null.
const RESOURCE_SUMMARY_COLUMNS =
  'id, skill_id, skill_node_id AS topic_id, title, resource_type, source_url, status, created_at, length(extracted_text) AS character_count';

export function list_resources(database, user_id, skill_id) {
  return database
    .prepare(`SELECT ${RESOURCE_SUMMARY_COLUMNS} FROM resources WHERE user_id = ? AND skill_id = ? ORDER BY created_at, rowid`)
    .all(user_id, skill_id);
}

export function get_resource_summary(database, resource_id) {
  return database.prepare(`SELECT ${RESOURCE_SUMMARY_COLUMNS} FROM resources WHERE id = ?`).get(resource_id);
}

// The full resource, including its extracted text. Other students' resources get a 404.
export function get_owned_resource(database, user_id, resource_id) {
  const resource = database
    .prepare(`SELECT ${RESOURCE_SUMMARY_COLUMNS}, extracted_text, file_path FROM resources WHERE id = ? AND user_id = ?`)
    .get(resource_id, user_id);
  if (!resource) throw create_http_error(HTTP_STATUS.not_found, 'Resource not found');
  return resource;
}

// Saves an imported resource whose text is already extracted, and returns its summary.
// resource.topic_id (optional) puts it under a skill-map topic.
export function insert_resource(database, resource) {
  database
    .prepare(
      `INSERT INTO resources (id, user_id, skill_id, skill_node_id, title, resource_type, source_url, file_path, extracted_text, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')`,
    )
    .run(
      resource.id,
      resource.user_id,
      resource.skill_id,
      resource.topic_id ?? null,
      resource.title,
      resource.resource_type,
      resource.source_url ?? null,
      resource.file_path ?? null,
      resource.extracted_text,
    );
  return get_resource_summary(database, resource.id);
}

// Removes the database row, then the uploaded file if there is one.
export async function delete_resource(database, uploads_path, user_id, resource_id) {
  const resource = get_owned_resource(database, user_id, resource_id);
  database.prepare('DELETE FROM resources WHERE id = ?').run(resource_id);
  if (resource.file_path) await remove_stored_file(uploads_path, resource.file_path);
}

// Every ready resource in a skill with its text, used as the AI's reference material:
// [{ id, title, extracted_text, topic_id }]. Empty when the skill has no resources, in
// which case the AI works from general knowledge.
export function list_skill_sources(database, user_id, skill_id) {
  return database
    .prepare(
      `SELECT id, title, extracted_text, skill_node_id AS topic_id FROM resources
       WHERE user_id = ? AND skill_id = ? AND status = 'ready' ORDER BY created_at, rowid`,
    )
    .all(user_id, skill_id);
}

// An even sample of all of a skill's resources ('' with none), for finding its topics or
// quizzing on the whole skill.
export function get_skill_overview_text(database, user_id, skill_id) {
  return select_overview_text(list_skill_sources(database, user_id, skill_id));
}
