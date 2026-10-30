import { randomUUID } from 'node:crypto';
import {
  HTTP_STATUS,
  MASTERY_RECENT_RESULTS,
  MAX_GENERATED_TOPICS,
  MAX_TOPIC_DEPTH,
  MAX_TOPICS_PER_SKILL,
  TOPIC_PATH_SEPARATOR,
  TOPIC_SUMMARY_MAX_LENGTH,
} from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { average_score, get_mastery_level, rank_study_suggestions } from './mastery.js';
import { get_skill_overview_text } from './resource_service.js';

// Topics nest like folders (parent_node_id points at the broader topic). resource_count is
// the number of resources filed directly under the topic.
const TOPIC_COLUMNS = `id, skill_id, parent_node_id, topic, summary, mastery_score, created_at,
  (SELECT count(*) FROM resources WHERE resources.skill_node_id = skill_nodes.id) AS resource_count`;
// Stops the depth and height walks below if parent links ever form a loop.
const MAX_WALK_STEPS = 100;
const DEPTH_LIMIT_MESSAGE = `Topics can be at most ${MAX_TOPIC_DEPTH} levels deep`;

// Adds mastery_level ("strong", "developing", "weak" or "untested") to a skill_nodes row.
export function to_topic(topic_row) {
  return { ...topic_row, mastery_level: get_mastery_level(topic_row.mastery_score) };
}

// A skill's topics in the order they were added, each with its mastery_level.
export function list_topics(database, user_id, skill_id) {
  return database
    .prepare(`SELECT ${TOPIC_COLUMNS} FROM skill_nodes WHERE user_id = ? AND skill_id = ? ORDER BY created_at, rowid`)
    .all(user_id, skill_id)
    .map(to_topic);
}

// Everything the skill map needs: { topics, suggestions }.
export function get_topic_map(database, user_id, skill_id) {
  const topics = list_topics(database, user_id, skill_id);
  return { topics, suggestions: rank_study_suggestions(topics) };
}

// The topic if it belongs to the student; otherwise the same 404 as a missing one.
export function get_owned_topic(database, user_id, topic_id) {
  const topic_row = database.prepare(`SELECT ${TOPIC_COLUMNS} FROM skill_nodes WHERE id = ? AND user_id = ?`).get(topic_id, user_id);
  if (!topic_row) throw create_http_error(HTTP_STATUS.not_found, 'Topic not found');
  return to_topic(topic_row);
}

// The skill's topic with this name (any letter case), or null. Lets quizzes and notes made
// from a typed topic count toward the matching node on the map.
export function find_topic_by_name(database, user_id, skill_id, topic_name) {
  const topic_row = database
    .prepare(`SELECT ${TOPIC_COLUMNS} FROM skill_nodes WHERE user_id = ? AND skill_id = ? AND topic = ? COLLATE NOCASE`)
    .get(user_id, skill_id, topic_name);
  return topic_row ? to_topic(topic_row) : null;
}

// The topic's id plus the ids of every topic under it, at any depth. A broad topic (a unit)
// covers its subtopics, so their resources count as its resources too. UNION (not UNION
// ALL) stops the walk if parent links ever form a loop.
export function list_topic_branch_ids(database, topic_id) {
  return database
    .prepare(
      `WITH RECURSIVE branch (id) AS (
         SELECT ?
         UNION
         SELECT skill_nodes.id FROM skill_nodes JOIN branch ON skill_nodes.parent_node_id = branch.id
       )
       SELECT id FROM branch`,
    )
    .all(topic_id)
    .map((branch_row) => branch_row.id);
}

// How deep a topic sits: 1 for a main topic, 2 for its subtopics, and so on.
export function get_topic_depth(database, topic_id) {
  return database
    .prepare(
      `WITH RECURSIVE ancestors (id, parent_node_id, depth) AS (
         SELECT id, parent_node_id, 1 FROM skill_nodes WHERE id = ?
         UNION
         SELECT skill_nodes.id, skill_nodes.parent_node_id, ancestors.depth + 1
         FROM skill_nodes JOIN ancestors ON skill_nodes.id = ancestors.parent_node_id
         WHERE ancestors.depth < ?
       )
       SELECT max(depth) AS depth FROM ancestors`,
    )
    .get(topic_id, MAX_WALK_STEPS).depth;
}

// A topic's place on the map, from its main topic down to it: "Maritime empires >
// Maritime technologies", or null without a topic. Every AI request about a map topic
// sends this with the skill's name, so the AI reads the topic as this subject teaches it.
export function format_topic_path(database, topic_id) {
  if (!topic_id) return null;
  return database
    .prepare(
      `WITH RECURSIVE ancestors (id, parent_node_id, topic, depth) AS (
         SELECT id, parent_node_id, topic, 1 FROM skill_nodes WHERE id = ?
         UNION
         SELECT skill_nodes.id, skill_nodes.parent_node_id, skill_nodes.topic, ancestors.depth + 1
         FROM skill_nodes JOIN ancestors ON skill_nodes.id = ancestors.parent_node_id
         WHERE ancestors.depth < ?
       )
       SELECT topic FROM ancestors ORDER BY depth DESC`,
    )
    .all(topic_id, MAX_WALK_STEPS)
    .map((ancestor_row) => ancestor_row.topic)
    .join(TOPIC_PATH_SEPARATOR);
}

// How many levels a topic's branch spans: 1 with no subtopics, 2 with subtopics only, and so on.
export function get_branch_height(database, topic_id) {
  return database
    .prepare(
      `WITH RECURSIVE branch (id, height) AS (
         SELECT ?, 1
         UNION
         SELECT skill_nodes.id, branch.height + 1
         FROM skill_nodes JOIN branch ON skill_nodes.parent_node_id = branch.id
         WHERE branch.height < ?
       )
       SELECT max(height) AS height FROM branch`,
    )
    .get(topic_id, MAX_WALK_STEPS).height;
}

// True when a branch of branch_height levels fits under parent_topic_id (null = at the top).
export function fits_under_parent(database, parent_topic_id, branch_height) {
  const parent_depth = parent_topic_id ? get_topic_depth(database, parent_topic_id) : 0;
  return parent_depth + branch_height <= MAX_TOPIC_DEPTH;
}

function count_topics(database, skill_id) {
  return database.prepare('SELECT count(*) AS topic_count FROM skill_nodes WHERE skill_id = ?').get(skill_id).topic_count;
}

// Refuses a name another topic in the skill already has (any letter case).
function assert_topic_name_available(database, user_id, skill_id, topic_name, excluded_topic_id = null) {
  const existing_topic = find_topic_by_name(database, user_id, skill_id, topic_name);
  if (existing_topic && existing_topic.id !== excluded_topic_id) {
    throw create_http_error(HTTP_STATUS.conflict, 'This skill already has that topic', {
      field_errors: { topic: 'This skill already has that topic' },
    });
  }
}

// A parent must be another topic in the same skill.
function assert_parent_in_skill(database, user_id, skill_id, parent_topic_id) {
  if (get_owned_topic(database, user_id, parent_topic_id).skill_id !== skill_id) {
    throw create_http_error(HTTP_STATUS.bad_request, 'The parent topic must be in the same skill');
  }
}

// Adds one topic to a skill, at the top or under parent_topic_id (any level, up to
// MAX_TOPIC_DEPTH). Refuses duplicates and skills already at MAX_TOPICS_PER_SKILL.
export function add_topic(database, user_id, skill_id, { topic, summary = null, parent_topic_id = null }) {
  assert_topic_name_available(database, user_id, skill_id, topic);
  if (count_topics(database, skill_id) >= MAX_TOPICS_PER_SKILL) {
    throw create_http_error(HTTP_STATUS.bad_request, `A skill can have at most ${MAX_TOPICS_PER_SKILL} topics`);
  }
  if (parent_topic_id) {
    assert_parent_in_skill(database, user_id, skill_id, parent_topic_id);
    if (!fits_under_parent(database, parent_topic_id, 1)) throw create_http_error(HTTP_STATUS.bad_request, DEPTH_LIMIT_MESSAGE);
  }

  const topic_id = randomUUID();
  database
    .prepare('INSERT INTO skill_nodes (id, user_id, skill_id, parent_node_id, topic, summary) VALUES (?, ?, ?, ?, ?, ?)')
    .run(topic_id, user_id, skill_id, parent_topic_id, topic, summary);
  return get_owned_topic(database, user_id, topic_id);
}

// Renames a topic and/or moves it (with everything under it) to a new parent, or to the
// top with parent_topic_id null. topic_updates holds whichever of { topic, parent_topic_id }
// were sent. A topic can't move inside its own branch, which would make a loop.
export function update_topic(database, user_id, topic_id, topic_updates) {
  const current_topic = get_owned_topic(database, user_id, topic_id);
  if (topic_updates.topic !== undefined) {
    assert_topic_name_available(database, user_id, current_topic.skill_id, topic_updates.topic, topic_id);
    database.prepare('UPDATE skill_nodes SET topic = ? WHERE id = ?').run(topic_updates.topic, topic_id);
  }
  if (topic_updates.parent_topic_id !== undefined) {
    const parent_topic_id = topic_updates.parent_topic_id;
    if (parent_topic_id) {
      assert_parent_in_skill(database, user_id, current_topic.skill_id, parent_topic_id);
      if (list_topic_branch_ids(database, topic_id).includes(parent_topic_id)) {
        throw create_http_error(HTTP_STATUS.bad_request, "A topic can't go inside itself or one of its own subtopics");
      }
    }
    if (!fits_under_parent(database, parent_topic_id, get_branch_height(database, topic_id))) {
      throw create_http_error(HTTP_STATUS.bad_request, DEPTH_LIMIT_MESSAGE);
    }
    database.prepare('UPDATE skill_nodes SET parent_node_id = ? WHERE id = ?').run(parent_topic_id, topic_id);
  }
  return get_owned_topic(database, user_id, topic_id);
}

// Saves topics suggested by the AI ([{ topic, summary, parent_topic }]). Topics the skill
// already has are kept as they are, so their quiz history is never lost. Parent links are
// made in a second pass, once every new topic exists. A new topic without a parent (or
// whose parent can't be placed) goes under root_parent_id: null for the top level, or the
// topic being broken into subtopics. Returns the updated topic map.
export function save_generated_topics(database, user_id, skill_id, generated_topics, root_parent_id = null) {
  const room_left = Math.max(0, MAX_TOPICS_PER_SKILL - count_topics(database, skill_id));
  const new_topics = generated_topics
    .filter((generated_topic) => !find_topic_by_name(database, user_id, skill_id, generated_topic.topic))
    .slice(0, room_left);

  for (const generated_topic of new_topics) {
    database
      .prepare('INSERT INTO skill_nodes (id, user_id, skill_id, parent_node_id, topic, summary) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        randomUUID(),
        user_id,
        skill_id,
        root_parent_id,
        generated_topic.topic,
        generated_topic.summary?.slice(0, TOPIC_SUMMARY_MAX_LENGTH) ?? null,
      );
  }

  // Subtopics of one topic may only link to topics inside that topic's branch.
  const allowed_parent_ids = root_parent_id ? new Set(list_topic_branch_ids(database, root_parent_id)) : null;
  for (const generated_topic of new_topics) {
    const child_topic = find_topic_by_name(database, user_id, skill_id, generated_topic.topic);
    const parent_topic = generated_topic.parent_topic
      ? find_topic_by_name(database, user_id, skill_id, generated_topic.parent_topic)
      : null;
    const can_link =
      parent_topic &&
      (!allowed_parent_ids || allowed_parent_ids.has(parent_topic.id)) &&
      !list_topic_branch_ids(database, child_topic.id).includes(parent_topic.id) &&
      fits_under_parent(database, parent_topic.id, get_branch_height(database, child_topic.id));
    if (can_link) {
      database.prepare('UPDATE skill_nodes SET parent_node_id = ? WHERE id = ?').run(parent_topic.id, child_topic.id);
    }
  }
  return get_topic_map(database, user_id, skill_id);
}

// Asks the AI for the skill's topics, read from an even sample of all its resources (or,
// with no resources, from what a course on the skill usually covers), and adds the new
// ones to the map. Returns the updated topic map.
export async function generate_skill_topics({ database, ai_provider, user_id, skill }) {
  const { topics } = await ai_provider.generate_topics({
    skill_name: skill.name,
    source_text: get_skill_overview_text(database, user_id, skill.id),
    max_topics: MAX_GENERATED_TOPICS,
    existing_topics: list_topics(database, user_id, skill.id).map((topic) => topic.topic),
  });
  return save_generated_topics(database, user_id, skill.id, topics);
}

// Deleting a topic works like deleting a folder whose contents are kept: its subtopics and
// resources move up to its parent (or to the top level / the skill in general). Its quizzes
// and notes are kept too; the schema clears their link.
export function delete_topic(database, user_id, topic_id) {
  const deleted_topic = get_owned_topic(database, user_id, topic_id);
  database.prepare('UPDATE skill_nodes SET parent_node_id = ? WHERE parent_node_id = ?').run(deleted_topic.parent_node_id, topic_id);
  database.prepare('UPDATE resources SET skill_node_id = ? WHERE skill_node_id = ?').run(deleted_topic.parent_node_id, topic_id);
  database.prepare('DELETE FROM skill_nodes WHERE id = ?').run(topic_id);
}

// Recalculates a topic's mastery from the student's last few quiz scores on it.
export function update_topic_mastery(database, topic_id) {
  const recent_scores = database
    .prepare(
      `SELECT quiz_results.score FROM quiz_results
       JOIN quizzes ON quizzes.id = quiz_results.quiz_id
       WHERE quizzes.skill_node_id = ? AND quiz_results.taker = 'student'
       ORDER BY quiz_results.completed_at DESC, quiz_results.rowid DESC
       LIMIT ?`,
    )
    .all(topic_id, MASTERY_RECENT_RESULTS)
    .map((result_row) => result_row.score);
  database.prepare('UPDATE skill_nodes SET mastery_score = ? WHERE id = ?').run(average_score(recent_scores), topic_id);
}
