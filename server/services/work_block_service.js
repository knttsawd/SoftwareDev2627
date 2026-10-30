import { randomUUID } from 'node:crypto';
import { HTTP_STATUS, MS_PER_MINUTE, WORK_BLOCK_ACTIVITIES, WORK_BLOCK_MINUTES } from '../config/constants.js';
import { get_owned_event } from './event_service.js';
import { create_http_error } from './http_error.js';
import { get_owned_skill } from './skill_service.js';

// Work blocks come with the student's break length and the linked event's title, so the
// timer page has everything it needs in one request.
const WORK_BLOCK_SELECT = `
  SELECT work_blocks.id, work_blocks.event_id, work_blocks.skill_id, work_blocks.activity,
         work_blocks.planned_minutes, work_blocks.completed_minutes, work_blocks.started_at, work_blocks.ended_at,
         users.break_minutes, events.title AS event_title, skills.name AS skill_name
  FROM work_blocks
  JOIN users ON users.id = work_blocks.user_id
  LEFT JOIN events ON events.id = work_blocks.event_id
  LEFT JOIN skills ON skills.id = work_blocks.skill_id`;

// Each validate_* function returns an error message, or null when the value is valid.

export function validate_activity(activity) {
  return WORK_BLOCK_ACTIVITIES.includes(activity) ? null : `Activity must be one of: ${WORK_BLOCK_ACTIVITIES.join(', ')}`;
}

export function validate_planned_minutes(planned_minutes) {
  if (planned_minutes === undefined) return null;
  if (!Number.isInteger(planned_minutes) || planned_minutes < WORK_BLOCK_MINUTES.min || planned_minutes > WORK_BLOCK_MINUTES.max) {
    return `Choose between ${WORK_BLOCK_MINUTES.min} and ${WORK_BLOCK_MINUTES.max} minutes`;
  }
  return null;
}

// Whole minutes between started_at and now, never more than planned_minutes.
export function count_completed_minutes(work_block, now = new Date()) {
  const elapsed_minutes = Math.floor((now - new Date(work_block.started_at)) / MS_PER_MINUTE);
  return Math.max(0, Math.min(elapsed_minutes, work_block.planned_minutes));
}

export function get_owned_work_block(database, user_id, work_block_id) {
  const work_block = database
    .prepare(`${WORK_BLOCK_SELECT} WHERE work_blocks.id = ? AND work_blocks.user_id = ?`)
    .get(work_block_id, user_id);
  if (!work_block) throw create_http_error(HTTP_STATUS.not_found, 'Work block not found');
  return work_block;
}

// The student's unfinished work block, or null. Lets the timer carry on after a page reload.
export function get_active_work_block(database, user_id) {
  return (
    database
      .prepare(`${WORK_BLOCK_SELECT} WHERE work_blocks.user_id = ? AND work_blocks.ended_at IS NULL ORDER BY work_blocks.started_at DESC LIMIT 1`)
      .get(user_id) ?? null
  );
}

// Records how a block ended: when, how many focused minutes, and the activity it ended on.
export function finish_work_block(database, user_id, work_block_id, { completed_minutes, activity }, now = new Date()) {
  const work_block = get_owned_work_block(database, user_id, work_block_id);
  if (work_block.ended_at) throw create_http_error(HTTP_STATUS.conflict, 'This work block has already ended');
  const kept_minutes = Math.max(0, Math.min(completed_minutes ?? count_completed_minutes(work_block, now), work_block.planned_minutes));
  database
    .prepare('UPDATE work_blocks SET ended_at = ?, completed_minutes = ?, activity = ? WHERE id = ?')
    .run(now.toISOString(), kept_minutes, activity ?? work_block.activity, work_block_id);
  return get_owned_work_block(database, user_id, work_block_id);
}

// Starts a work block. The length defaults to the student's work_minutes. A block started
// from a schedule event takes that event's subject. Only one block runs at a time, so any
// unfinished one is ended first with the minutes it actually ran.
export function start_work_block(database, user_id, { activity, event_id = null, skill_id = null, planned_minutes }, now = new Date()) {
  const event = event_id ? get_owned_event(database, user_id, event_id) : null;
  const block_skill_id = event?.skill_id ?? skill_id;
  if (block_skill_id) get_owned_skill(database, user_id, block_skill_id);

  const previous_block = get_active_work_block(database, user_id);
  if (previous_block) finish_work_block(database, user_id, previous_block.id, {}, now);

  const block_minutes =
    planned_minutes ?? database.prepare('SELECT work_minutes FROM users WHERE id = ?').get(user_id).work_minutes;
  const work_block_id = randomUUID();
  database
    .prepare(
      'INSERT INTO work_blocks (id, user_id, event_id, skill_id, activity, planned_minutes, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(work_block_id, user_id, event?.id ?? null, block_skill_id, activity, block_minutes, now.toISOString());
  return get_owned_work_block(database, user_id, work_block_id);
}
