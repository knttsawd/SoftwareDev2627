import { randomUUID } from 'node:crypto';
import { HTTP_STATUS, MAX_GENERATED_GLOSSARY_TERMS, MAX_GLOSSARY_TERMS_PER_SKILL } from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { get_skill_overview_text } from './resource_service.js';
import { resolve_resource_topic_id } from './topic_resource_service.js';
import { list_topics } from './topic_service.js';

// Key terms: a glossary per skill. Terms are found by the AI in the skill's resources (or
// from general knowledge when there are none) or added by hand, and each can belong to a
// topic on the skill map. Term names are unique per skill, ignoring letter case.

const TERM_COLUMNS = 'id, skill_id, skill_node_id AS topic_id, term, definition, created_at';

// The skill's terms in alphabetical order.
export function list_glossary_terms(database, user_id, skill_id) {
  return database
    .prepare(`SELECT ${TERM_COLUMNS} FROM glossary_terms WHERE user_id = ? AND skill_id = ? ORDER BY term COLLATE NOCASE, rowid`)
    .all(user_id, skill_id);
}

// How many more terms the skill can take.
export function count_room_for_terms(database, user_id, skill_id) {
  const { term_count } = database
    .prepare('SELECT count(*) AS term_count FROM glossary_terms WHERE user_id = ? AND skill_id = ?')
    .get(user_id, skill_id);
  return Math.max(0, MAX_GLOSSARY_TERMS_PER_SKILL - term_count);
}

function assert_room_for_terms(database, user_id, skill_id) {
  if (count_room_for_terms(database, user_id, skill_id) === 0) {
    throw create_http_error(HTTP_STATUS.conflict, `A skill can have at most ${MAX_GLOSSARY_TERMS_PER_SKILL} key terms. Delete some to add more.`);
  }
}

// Adds a term written by the student. term_details: { term, definition, topic_id }.
export function add_glossary_term(database, user_id, skill_id, term_details) {
  assert_room_for_terms(database, user_id, skill_id);
  const topic_id = resolve_resource_topic_id(database, user_id, skill_id, term_details.topic_id);
  const term_id = randomUUID();
  const { changes } = database
    .prepare('INSERT OR IGNORE INTO glossary_terms (id, user_id, skill_id, skill_node_id, term, definition) VALUES (?, ?, ?, ?, ?, ?)')
    .run(term_id, user_id, skill_id, topic_id, term_details.term, term_details.definition);
  if (changes === 0) {
    throw create_http_error(HTTP_STATUS.conflict, 'That term is already in the list', { field_errors: { term: 'You already have this term' } });
  }
  return database.prepare(`SELECT ${TERM_COLUMNS} FROM glossary_terms WHERE id = ?`).get(term_id);
}

// Asks the AI for key terms the skill doesn't have yet and adds them, each linked to the
// topic the AI named (matched by name, ignoring letter case). Returns { added_count, terms }.
export async function generate_glossary_terms({ database, ai_provider, user_id, skill }) {
  assert_room_for_terms(database, user_id, skill.id);
  const topics = list_topics(database, user_id, skill.id);
  const topic_ids_by_name = new Map(topics.map((topic) => [topic.topic.toLowerCase(), topic.id]));
  const { terms } = await ai_provider.generate_glossary({
    skill_name: skill.name,
    source_text: get_skill_overview_text(database, user_id, skill.id),
    topics: topics.map((topic) => topic.topic),
    existing_terms: list_glossary_terms(database, user_id, skill.id).map((glossary_term) => glossary_term.term),
    max_terms: Math.min(MAX_GENERATED_GLOSSARY_TERMS, count_room_for_terms(database, user_id, skill.id)),
  });

  const insert_term = database.prepare(
    'INSERT OR IGNORE INTO glossary_terms (id, user_id, skill_id, skill_node_id, term, definition) VALUES (?, ?, ?, ?, ?, ?)',
  );
  let added_count = 0;
  for (const { term, definition, topic } of terms) {
    const topic_id = topic_ids_by_name.get(topic.toLowerCase()) ?? null;
    added_count += insert_term.run(randomUUID(), user_id, skill.id, topic_id, term, definition).changes;
  }
  return { added_count, terms: list_glossary_terms(database, user_id, skill.id) };
}

// Other students' terms, and terms from another skill, get the same 404 as missing ones.
export function delete_glossary_term(database, user_id, skill_id, term_id) {
  const { changes } = database
    .prepare('DELETE FROM glossary_terms WHERE id = ? AND user_id = ? AND skill_id = ?')
    .run(term_id, user_id, skill_id);
  if (changes === 0) throw create_http_error(HTTP_STATUS.not_found, 'Key term not found');
}
