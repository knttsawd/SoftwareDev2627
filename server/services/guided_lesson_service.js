import { randomUUID } from 'node:crypto';
import { EXPLAIN_SOURCE_CHARACTERS, HTTP_STATUS, MAX_LESSON_RETEACHES, RECENT_LEARNING_ITEMS_LIMIT } from '../config/constants.js';
import { to_lesson_check } from './ai/learning_outputs.js';
import { create_http_error } from './http_error.js';
import { get_learning_style } from './learning_profile_service.js';
import { resolve_quiz_topic } from './quiz_service.js';
import { get_topic_source_text } from './topic_resource_service.js';
import { format_topic_path } from './topic_service.js';

// Guided lessons: the AI teaches one topic in a few short steps. Each step explains one
// idea, gives an example and ends with a check question. A missed check can be explained
// again in a different way, with a new question, up to MAX_LESSON_RETEACHES times; then
// the student moves on. The lesson is complete once every step's check has been answered.
// A step's checks are stored in order, so the last one is the one being answered.

const LESSON_COLUMNS = 'id, user_id, skill_id, skill_node_id, topic, steps, current_step, completed_at, created_at';

export function get_current_check(step) {
  return step.checks.at(-1);
}

export function is_check_correct(check) {
  return check.chosen_index === check.correct_index;
}

// A check as the client sees it: the answer and explanation stay hidden until it's answered.
export function to_public_check(check) {
  const public_check = {
    reteach_markdown: check.reteach_markdown,
    question: check.question,
    choices: check.choices,
    chosen_index: check.chosen_index,
  };
  if (check.chosen_index === null) return public_check;
  return { ...public_check, correct_index: check.correct_index, explanation: check.explanation, is_correct: is_check_correct(check) };
}

// True when the step's latest check was answered wrongly and it can still be explained again.
export function can_reteach(step) {
  const check = get_current_check(step);
  return check.chosen_index !== null && !is_check_correct(check) && step.checks.length <= MAX_LESSON_RETEACHES;
}

// How many steps the student got right the first time.
export function count_first_try_correct(steps) {
  return steps.filter((step) => is_check_correct(step.checks[0])).length;
}

// The lesson as the client sees it: the steps up to the current one (later steps stay
// hidden so they're met in order), with answers hidden on unanswered checks.
export function to_guided_lesson(lesson_row) {
  const steps = JSON.parse(lesson_row.steps);
  const is_complete = lesson_row.completed_at !== null;
  return {
    id: lesson_row.id,
    skill_id: lesson_row.skill_id,
    topic_id: lesson_row.skill_node_id,
    topic: lesson_row.topic,
    step_count: steps.length,
    current_step: lesson_row.current_step,
    is_complete,
    completed_at: lesson_row.completed_at,
    created_at: lesson_row.created_at,
    steps: steps.slice(0, lesson_row.current_step + 1).map((step) => ({
      title: step.title,
      explanation_markdown: step.explanation_markdown,
      example_markdown: step.example_markdown,
      checks: step.checks.map(to_public_check),
    })),
    can_reteach: !is_complete && can_reteach(steps[lesson_row.current_step]),
    first_try_correct: is_complete ? count_first_try_correct(steps) : null,
  };
}

export function get_owned_guided_lesson(database, user_id, lesson_id) {
  const lesson_row = database.prepare(`SELECT ${LESSON_COLUMNS} FROM guided_lessons WHERE id = ? AND user_id = ?`).get(lesson_id, user_id);
  if (!lesson_row) throw create_http_error(HTTP_STATUS.not_found, 'Lesson not found');
  return lesson_row;
}

// The skill's lessons, newest first: [{ id, topic_id, topic, step_count, current_step,
// is_complete, created_at }].
export function list_guided_lessons(database, user_id, skill_id, limit = RECENT_LEARNING_ITEMS_LIMIT) {
  return database
    .prepare(
      `SELECT id, skill_node_id AS topic_id, topic, json_array_length(steps) AS step_count, current_step,
              completed_at IS NOT NULL AS is_complete, created_at
       FROM guided_lessons WHERE user_id = ? AND skill_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(user_id, skill_id, limit)
    .map((lesson_summary) => ({ ...lesson_summary, is_complete: lesson_summary.is_complete === 1 }));
}

// Writes the steps and where the student is, and marks the lesson complete once
// current_step is past the last step.
function save_lesson_progress(database, lesson_row, steps, current_step) {
  const completed_at = current_step >= steps.length ? new Date().toISOString() : null;
  database
    .prepare('UPDATE guided_lessons SET steps = ?, current_step = ?, completed_at = ? WHERE id = ?')
    .run(JSON.stringify(steps), Math.min(current_step, steps.length - 1), completed_at, lesson_row.id);
}

function assert_in_progress(lesson_row) {
  if (lesson_row.completed_at !== null) throw create_http_error(HTTP_STATUS.conflict, 'This lesson is finished. Start a new one to go over it again.');
}

// Asks the AI for a lesson on a map topic (topic_id) or a typed topic, built on the
// topic's resources first and general knowledge for the rest, and saves it.
// lesson_details: { topic, topic_id, step_count }.
export async function start_guided_lesson({ database, ai_provider, user_id, skill, lesson_details }) {
  const { topic, topic_id, search_text } = resolve_quiz_topic(database, user_id, skill.id, lesson_details);
  const { steps } = await ai_provider.generate_lesson({
    skill_name: skill.name,
    topic,
    topic_path: format_topic_path(database, topic_id),
    source_text: get_topic_source_text(database, user_id, skill.id, { search_text, topic_id }),
    step_count: lesson_details.step_count,
    learning_style: get_learning_style(database, user_id),
  });
  const lesson_id = randomUUID();
  database
    .prepare('INSERT INTO guided_lessons (id, user_id, skill_id, skill_node_id, topic, steps) VALUES (?, ?, ?, ?, ?, ?)')
    .run(lesson_id, user_id, skill.id, topic_id, topic, JSON.stringify(steps));
  return to_guided_lesson(get_owned_guided_lesson(database, user_id, lesson_id));
}

// Records the answer to the current step's latest check. Each check is answered once.
export function answer_lesson_check({ database, user_id, lesson_row, choice_index }) {
  assert_in_progress(lesson_row);
  const steps = JSON.parse(lesson_row.steps);
  const check = get_current_check(steps[lesson_row.current_step]);
  if (check.chosen_index !== null) throw create_http_error(HTTP_STATUS.conflict, "You've already answered this question.");
  check.chosen_index = choice_index;
  save_lesson_progress(database, lesson_row, steps, lesson_row.current_step);
  return to_guided_lesson(get_owned_guided_lesson(database, user_id, lesson_row.id));
}

// After a missed check: the AI explains the step's idea again, starting from the wrong
// answer, and adds a new check question.
export async function reteach_current_step({ database, ai_provider, user_id, skill, lesson_row }) {
  assert_in_progress(lesson_row);
  const steps = JSON.parse(lesson_row.steps);
  const step = steps[lesson_row.current_step];
  if (!can_reteach(step)) throw create_http_error(HTTP_STATUS.conflict, "There's nothing to explain again here. Carry on to the next step.");

  const missed_check = get_current_check(step);
  const { reteach_markdown, check } = await ai_provider.reteach_lesson_step({
    skill_name: skill.name,
    topic: lesson_row.topic,
    topic_path: format_topic_path(database, lesson_row.skill_node_id),
    step: { title: step.title, explanation_markdown: step.explanation_markdown },
    missed_check: {
      question: missed_check.question,
      chosen_choice: missed_check.choices[missed_check.chosen_index],
      correct_choice: missed_check.choices[missed_check.correct_index],
    },
    source_text: get_topic_source_text(database, user_id, skill.id, {
      search_text: `${lesson_row.topic} ${step.title}`,
      topic_id: lesson_row.skill_node_id,
      max_characters: EXPLAIN_SOURCE_CHARACTERS,
    }),
    learning_style: get_learning_style(database, user_id),
  });
  step.checks.push(to_lesson_check(check, reteach_markdown));
  save_lesson_progress(database, lesson_row, steps, lesson_row.current_step);
  return to_guided_lesson(get_owned_guided_lesson(database, user_id, lesson_row.id));
}

// Moves on to the next step once the current check is answered (right or wrong); after
// the last step, the lesson is complete.
export function advance_guided_lesson({ database, user_id, lesson_row }) {
  assert_in_progress(lesson_row);
  const steps = JSON.parse(lesson_row.steps);
  if (get_current_check(steps[lesson_row.current_step]).chosen_index === null) {
    throw create_http_error(HTTP_STATUS.conflict, 'Answer the question first.');
  }
  save_lesson_progress(database, lesson_row, steps, lesson_row.current_step + 1);
  return to_guided_lesson(get_owned_guided_lesson(database, user_id, lesson_row.id));
}

export function delete_guided_lesson(database, user_id, lesson_id) {
  get_owned_guided_lesson(database, user_id, lesson_id);
  database.prepare('DELETE FROM guided_lessons WHERE id = ?').run(lesson_id);
}
