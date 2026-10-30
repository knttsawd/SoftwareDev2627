import { HTTP_STATUS, MAX_GENERATED_SUBTOPICS, MAX_SOURCE_CHARACTERS, MAX_TOPIC_DEPTH } from '../config/constants.js';
import { select_focused_source_text, select_source_text } from './ai/source_selection.js';
import { create_http_error } from './http_error.js';
import { get_owned_resource, get_resource_summary, list_skill_sources } from './resource_service.js';
import { get_owned_skill } from './skill_service.js';
import {
  fits_under_parent,
  format_topic_path,
  get_owned_topic,
  list_topic_branch_ids,
  list_topics,
  save_generated_topics,
} from './topic_service.js';

// Links between resources and skill-map topics. A topic can be broad, like a unit, and
// collect its own resources; the AI then leans on those when it works on that topic.

// Checks that topic_id (or null, meaning "no topic") is a topic in the given skill, and
// returns it. Used before saving a resource under a topic.
export function resolve_resource_topic_id(database, user_id, skill_id, topic_id) {
  if (!topic_id) return null;
  if (get_owned_topic(database, user_id, topic_id).skill_id !== skill_id) {
    throw create_http_error(HTTP_STATUS.bad_request, 'That topic belongs to a different skill');
  }
  return topic_id;
}

// Puts a resource under a topic in its own skill, or takes it out of its topic with null.
// Returns the updated resource summary.
export function move_resource_to_topic(database, user_id, resource_id, topic_id) {
  const resource = get_owned_resource(database, user_id, resource_id);
  const checked_topic_id = resolve_resource_topic_id(database, user_id, resource.skill_id, topic_id);
  database.prepare('UPDATE resources SET skill_node_id = ? WHERE id = ?').run(checked_topic_id, resource_id);
  return get_resource_summary(database, resource_id);
}

// The resource text the AI gets for a topic, '' when the skill has no resources.
// With topic_id, resources filed under that topic or any topic below it come first and
// the rest of the skill fills any room left; otherwise the parts of all resources that
// best match search_text are used.
export function get_topic_source_text(
  database,
  user_id,
  skill_id,
  { search_text, topic_id = null, max_characters = MAX_SOURCE_CHARACTERS },
) {
  const skill_sources = list_skill_sources(database, user_id, skill_id);
  if (topic_id) {
    const branch_ids = new Set(list_topic_branch_ids(database, topic_id));
    const focus_sources = skill_sources.filter((source) => branch_ids.has(source.topic_id));
    if (focus_sources.length > 0) {
      const other_sources = skill_sources.filter((source) => !branch_ids.has(source.topic_id));
      return select_focused_source_text(focus_sources, other_sources, search_text, { max_characters });
    }
  }
  return select_source_text(skill_sources, search_text, { max_characters });
}

// Asks the AI to break a topic into smaller subtopics (one level more detail), from the
// topic's own resources first and general knowledge for the rest, and files the new ones
// under it. Returns the updated topic map.
export async function generate_subtopics({ database, ai_provider, user_id, topic_id }) {
  const parent_topic = get_owned_topic(database, user_id, topic_id);
  if (!fits_under_parent(database, topic_id, 1)) {
    throw create_http_error(HTTP_STATUS.bad_request, `Topics can be at most ${MAX_TOPIC_DEPTH} levels deep`);
  }
  const skill = get_owned_skill(database, user_id, parent_topic.skill_id);
  const { topics } = await ai_provider.generate_topics({
    skill_name: skill.name,
    focus_topic: { topic: parent_topic.topic, summary: parent_topic.summary, topic_path: format_topic_path(database, topic_id) },
    source_text: get_topic_source_text(database, user_id, skill.id, {
      search_text: `${parent_topic.topic} ${parent_topic.summary ?? ''}`,
      topic_id,
    }),
    max_topics: MAX_GENERATED_SUBTOPICS,
    existing_topics: list_topics(database, user_id, skill.id).map((topic) => topic.topic),
  });
  return save_generated_topics(database, user_id, skill.id, topics, topic_id);
}
