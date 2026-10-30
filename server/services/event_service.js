import { randomUUID } from 'node:crypto';
import { HTTP_STATUS } from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { get_owned_skill } from './skill_service.js';

// Each event comes with its subject's name and color, so the calendar can show both.
const EVENT_SELECT = `
  SELECT events.id, events.skill_id, events.title, events.details, events.starts_at, events.ends_at,
         events.created_at, skills.name AS skill_name, skills.color AS skill_color
  FROM events LEFT JOIN skills ON skills.id = events.skill_id`;

// Events that overlap the from-to range (ISO timestamps), earliest first. An event that
// starts before the range but runs into it is included.
export function list_events(database, user_id, from, to) {
  return database
    .prepare(`${EVENT_SELECT} WHERE events.user_id = ? AND events.starts_at < ? AND events.ends_at > ? ORDER BY events.starts_at`)
    .all(user_id, to, from);
}

// The event if it belongs to the student; otherwise the same 404 as a missing one.
export function get_owned_event(database, user_id, event_id) {
  const event_row = database.prepare(`${EVENT_SELECT} WHERE events.id = ? AND events.user_id = ?`).get(event_id, user_id);
  if (!event_row) throw create_http_error(HTTP_STATUS.not_found, 'Event not found');
  return event_row;
}

// Checks that a subject (skill) chosen for an event is the student's own.
function assert_owned_skill(database, user_id, skill_id) {
  if (skill_id) get_owned_skill(database, user_id, skill_id);
}

// event_values: validated { title, details?, skill_id?, starts_at, ends_at }.
export function create_event(database, user_id, event_values) {
  assert_owned_skill(database, user_id, event_values.skill_id);
  const event_id = randomUUID();
  database
    .prepare('INSERT INTO events (id, user_id, skill_id, title, details, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      event_id,
      user_id,
      event_values.skill_id ?? null,
      event_values.title,
      event_values.details ?? null,
      event_values.starts_at,
      event_values.ends_at,
    );
  return get_owned_event(database, user_id, event_id);
}

// event_updates holds validated fields only, so the SQL column names come from that fixed
// set (title, details, skill_id, starts_at, ends_at), never from the request.
export function update_event(database, user_id, event_id, event_updates) {
  get_owned_event(database, user_id, event_id);
  assert_owned_skill(database, user_id, event_updates.skill_id);
  const set_clause = Object.keys(event_updates)
    .map((column_name) => `${column_name} = ?`)
    .join(', ');
  database.prepare(`UPDATE events SET ${set_clause} WHERE id = ?`).run(...Object.values(event_updates), event_id);
  return get_owned_event(database, user_id, event_id);
}

export function delete_event(database, user_id, event_id) {
  get_owned_event(database, user_id, event_id);
  database.prepare('DELETE FROM events WHERE id = ?').run(event_id);
}
