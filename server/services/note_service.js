import { randomUUID } from 'node:crypto';
import { HTTP_STATUS } from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { get_learning_style } from './learning_profile_service.js';
import { get_topic_source_text } from './topic_resource_service.js';
import { get_owned_skill } from './skill_service.js';
import { find_topic_by_name, format_topic_path } from './topic_service.js';

const NOTE_COLUMNS = 'id, skill_id, skill_node_id, topic, content, created_at';

// Newest notes first.
export function list_notes(database, user_id, skill_id) {
  return database
    .prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE user_id = ? AND skill_id = ? ORDER BY created_at DESC`)
    .all(user_id, skill_id);
}

// Asks the AI for notes on topic, shaped by the student's learning style, and saves them.
// When the skill map has a topic of the same name, the notes are linked to it and that
// topic's own resources come first. The AI fills gaps from general knowledge.
// Returns the saved note.
export async function create_study_notes({ database, ai_provider, user_id, skill_id, topic }) {
  const map_topic_id = find_topic_by_name(database, user_id, skill_id, topic)?.id ?? null;
  const { notes_markdown } = await ai_provider.generate_notes({
    skill_name: get_owned_skill(database, user_id, skill_id).name,
    topic,
    topic_path: format_topic_path(database, map_topic_id),
    source_text: get_topic_source_text(database, user_id, skill_id, { search_text: topic, topic_id: map_topic_id }),
    learning_style: get_learning_style(database, user_id),
  });

  const note_id = randomUUID();
  database
    .prepare('INSERT INTO notes (id, user_id, skill_id, skill_node_id, topic, content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(note_id, user_id, skill_id, map_topic_id, topic, notes_markdown);
  return database.prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ?`).get(note_id);
}

// Other students' notes get the same 404 as missing ones.
export function delete_note(database, user_id, note_id) {
  const { changes } = database.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(note_id, user_id);
  if (changes === 0) throw create_http_error(HTTP_STATUS.not_found, 'Note not found');
}

// One of the student's notes; someone else's gets the same 404 as a missing one.
export function get_owned_note(database, user_id, note_id) {
  const note = database.prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ? AND user_id = ?`).get(note_id, user_id);
  if (!note) throw create_http_error(HTTP_STATUS.not_found, 'Note not found');
  return note;
}
