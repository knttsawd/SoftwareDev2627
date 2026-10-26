import { MASTERY_LEVEL } from './mastery.js';
import { generate_skill_topics, list_topics } from './topic_service.js';

// The learning path: the order to learn a skill's topics in, foundations first. Only the
// topics actually learned are on it, the ones with no subtopics; a broad topic (a unit)
// shows as the "part of" label of its steps. The AI picks the order once, and it's saved.
// Topics added later go at the end until the path is rebuilt.
//
// Each step's status:
//   done  a guided lesson on it was finished, or its quizzes show it's strong
//   next  the first step that isn't done
//   todo  everything after that

export const PATH_STEP_STATUS = { done: 'done', next: 'next', todo: 'todo' };

// The topics with no subtopics, in map order (each topic's subtopics straight after it,
// depth first), each with its parent's name: [{ id, topic, summary, parent_topic,
// mastery_level }]. Topics whose parent is missing count as main topics, and a visited
// set stops the walk if parent links ever form a loop.
export function list_path_topics(topics) {
  const topic_ids = new Set(topics.map((topic) => topic.id));
  const children_by_parent = new Map();
  for (const topic of topics) {
    const parent_id = topic_ids.has(topic.parent_node_id) ? topic.parent_node_id : null;
    children_by_parent.set(parent_id, [...(children_by_parent.get(parent_id) ?? []), topic]);
  }

  const path_topics = [];
  const visited_ids = new Set();
  function visit(topic, parent_topic) {
    if (visited_ids.has(topic.id)) return;
    visited_ids.add(topic.id);
    const children = children_by_parent.get(topic.id) ?? [];
    if (children.length === 0) {
      path_topics.push({
        id: topic.id,
        topic: topic.topic,
        summary: topic.summary ?? '',
        parent_topic: parent_topic?.topic ?? '',
        mastery_level: topic.mastery_level,
      });
    }
    for (const child of children) visit(child, topic);
  }
  for (const main_topic of children_by_parent.get(null) ?? []) visit(main_topic, null);
  return path_topics;
}

// For each topic with guided lessons: { latest_lesson_id, is_latest_complete, has_finished }.
// lesson_rows are { id, topic_id, is_complete }, oldest first.
export function summarize_topic_lessons(lesson_rows) {
  const lessons_by_topic = new Map();
  for (const lesson_row of lesson_rows) {
    const earlier = lessons_by_topic.get(lesson_row.topic_id);
    lessons_by_topic.set(lesson_row.topic_id, {
      latest_lesson_id: lesson_row.id,
      is_latest_complete: lesson_row.is_complete,
      has_finished: Boolean(earlier?.has_finished) || lesson_row.is_complete,
    });
  }
  return lessons_by_topic;
}

// Adds each step's status: done steps, then the first unfinished one is "next".
export function assign_path_statuses(path_steps) {
  let has_next = false;
  return path_steps.map((path_step) => {
    const is_done = path_step.lesson?.has_finished || path_step.mastery_level === MASTERY_LEVEL.strong;
    if (is_done) return { ...path_step, status: PATH_STEP_STATUS.done };
    const status = has_next ? PATH_STEP_STATUS.todo : PATH_STEP_STATUS.next;
    has_next = true;
    return { ...path_step, status };
  });
}

function list_topic_lesson_rows(database, user_id, skill_id) {
  return database
    .prepare(
      `SELECT id, skill_node_id AS topic_id, completed_at IS NOT NULL AS is_complete FROM guided_lessons
       WHERE user_id = ? AND skill_id = ? AND skill_node_id IS NOT NULL ORDER BY created_at, rowid`,
    )
    .all(user_id, skill_id)
    .map((lesson_row) => ({ ...lesson_row, is_complete: lesson_row.is_complete === 1 }));
}

// The skill's path: { has_path, created_at, steps, new_topic_count, topic_count }.
// steps are [{ topic_id, topic, summary, parent_topic, reason, is_new, mastery_level,
// lesson, status }], where lesson is summarize_topic_lessons' entry or null. Steps for
// deleted topics are dropped, and topics not on the saved path are added at the end with
// is_new set.
export function get_learning_path(database, user_id, skill) {
  const path_topics = list_path_topics(list_topics(database, user_id, skill.id));
  const path_row = database.prepare('SELECT steps, created_at FROM learning_paths WHERE skill_id = ? AND user_id = ?').get(skill.id, user_id);
  if (!path_row) return { has_path: false, created_at: null, steps: [], new_topic_count: 0, topic_count: path_topics.length };

  const topics_by_id = new Map(path_topics.map((path_topic) => [path_topic.id, path_topic]));
  const saved_steps = JSON.parse(path_row.steps).filter((saved_step) => topics_by_id.has(saved_step.topic_id));
  const saved_ids = new Set(saved_steps.map((saved_step) => saved_step.topic_id));
  const new_topics = path_topics.filter((path_topic) => !saved_ids.has(path_topic.id));
  const lessons_by_topic = summarize_topic_lessons(list_topic_lesson_rows(database, user_id, skill.id));

  const ordered_entries = [
    ...saved_steps.map((saved_step) => ({ path_topic: topics_by_id.get(saved_step.topic_id), reason: saved_step.reason, is_new: false })),
    ...new_topics.map((path_topic) => ({ path_topic, reason: '', is_new: true })),
  ];
  const steps = assign_path_statuses(
    ordered_entries.map(({ path_topic, reason, is_new }) => ({
      topic_id: path_topic.id,
      topic: path_topic.topic,
      summary: path_topic.summary,
      parent_topic: path_topic.parent_topic,
      reason,
      is_new,
      mastery_level: path_topic.mastery_level,
      lesson: lessons_by_topic.get(path_topic.id) ?? null,
    })),
  );
  return { has_path: true, created_at: path_row.created_at, steps, new_topic_count: new_topics.length, topic_count: path_topics.length };
}

// Asks the AI to order the skill's topics and saves the path, replacing any earlier one.
// A skill with no topics yet gets them found first, the same way as "Find topics" on the
// skill map. Returns the new path.
export async function build_learning_path({ database, ai_provider, user_id, skill }) {
  if (list_topics(database, user_id, skill.id).length === 0) {
    await generate_skill_topics({ database, ai_provider, user_id, skill });
  }
  const path_topics = list_path_topics(list_topics(database, user_id, skill.id));
  const { steps } = await ai_provider.order_learning_path({
    skill_name: skill.name,
    topics: path_topics.map(({ topic, summary, parent_topic }) => ({ topic, summary, parent_topic })),
  });
  const saved_steps = steps.map(({ index, reason }) => ({ topic_id: path_topics[index].id, reason }));
  database
    .prepare(
      `INSERT INTO learning_paths (skill_id, user_id, steps) VALUES (?, ?, ?)
       ON CONFLICT (skill_id) DO UPDATE SET steps = excluded.steps, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .run(skill.id, user_id, JSON.stringify(saved_steps));
  return get_learning_path(database, user_id, skill);
}
