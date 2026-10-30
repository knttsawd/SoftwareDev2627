import { randomUUID } from 'node:crypto';
import { DEFAULT_WIDGET_LAYOUT, HTTP_STATUS, MAX_WIDGET_STACKS } from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { get_owned_widget } from './widget_service.js';

// Smart stacks: two or more widgets shown in one place, one at a time, like the widget
// stacks on a phone. The student swipes between them ("swipe") or picks one from a row of
// titles ("list"). A stack is placed like a widget (its own layout and pinned_paths); while
// a widget is in a stack, the stack decides where it shows. A stack left with one widget
// is taken apart, and that widget goes back to showing on its own where the stack was.

const STACK_COLUMNS = 'id, widget_ids, view, active_widget_id, pinned_paths, layout, created_at, updated_at';

export function to_stack(stack_row) {
  return {
    ...stack_row,
    widget_ids: JSON.parse(stack_row.widget_ids),
    pinned_paths: JSON.parse(stack_row.pinned_paths),
    layout: { ...DEFAULT_WIDGET_LAYOUT, ...JSON.parse(stack_row.layout) },
  };
}

// Oldest first.
export function list_stacks(database, user_id) {
  return database
    .prepare(`SELECT ${STACK_COLUMNS} FROM widget_stacks WHERE user_id = ? ORDER BY created_at, rowid`)
    .all(user_id)
    .map(to_stack);
}

export function get_owned_stack(database, user_id, stack_id) {
  const stack_row = database.prepare(`SELECT ${STACK_COLUMNS} FROM widget_stacks WHERE id = ? AND user_id = ?`).get(stack_id, user_id);
  if (!stack_row) throw create_http_error(HTTP_STATUS.not_found, 'Stack not found');
  return to_stack(stack_row);
}

// The stack a widget is in, or null.
export function find_widget_stack(database, user_id, widget_id) {
  return list_stacks(database, user_id).find((stack) => stack.widget_ids.includes(widget_id)) ?? null;
}

// Checks the widgets can go in a stack: each is the student's, and none is already in
// another stack (other than except_stack_id).
function check_stackable(database, user_id, widget_ids, except_stack_id = null) {
  for (const widget_id of widget_ids) {
    const widget = get_owned_widget(database, user_id, widget_id);
    const current_stack = find_widget_stack(database, user_id, widget_id);
    if (current_stack && current_stack.id !== except_stack_id) {
      throw create_http_error(HTTP_STATUS.conflict, `"${widget.title}" is already in a stack`);
    }
  }
}

// Makes a stack from checked values (validate_new_stack's). A student can have
// MAX_WIDGET_STACKS. The first widget shows first.
export function create_stack(database, user_id, { widget_ids, view, pinned_paths, layout }) {
  check_stackable(database, user_id, widget_ids);
  const { stack_count } = database.prepare('SELECT count(*) AS stack_count FROM widget_stacks WHERE user_id = ?').get(user_id);
  if (stack_count >= MAX_WIDGET_STACKS) {
    throw create_http_error(HTTP_STATUS.conflict, `You can have at most ${MAX_WIDGET_STACKS} stacks. Take one apart to make another.`);
  }
  const stack_id = randomUUID();
  database
    .prepare('INSERT INTO widget_stacks (id, user_id, widget_ids, view, active_widget_id, pinned_paths, layout) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(stack_id, user_id, JSON.stringify(widget_ids), view, widget_ids[0], JSON.stringify(pinned_paths), JSON.stringify(layout));
  return get_owned_stack(database, user_id, stack_id);
}

// Takes a stack apart: its widgets go back to showing on their own, where the stack was.
export function delete_stack(database, user_id, stack_id) {
  const stack = get_owned_stack(database, user_id, stack_id);
  const pin_widget = database.prepare('UPDATE widgets SET pinned_paths = ? WHERE id = ? AND user_id = ?');
  database.exec('BEGIN');
  try {
    for (const widget_id of stack.widget_ids) pin_widget.run(JSON.stringify(stack.pinned_paths), widget_id, user_id);
    database.prepare('DELETE FROM widget_stacks WHERE id = ?').run(stack.id);
    database.exec('COMMIT');
  } catch (delete_error) {
    database.exec('ROLLBACK');
    throw delete_error;
  }
}

// Applies checked updates (validate_stack_updates' values). New widget_ids may reorder,
// add or drop widgets; a widget dropped goes back to showing on its own where the stack is.
// With one widget left, the stack is taken apart and null is returned. The active widget
// must be one of the stack's (otherwise the first is shown).
export function update_stack(database, user_id, stack_id, stack_updates) {
  const stack = get_owned_stack(database, user_id, stack_id);
  const widget_ids = stack_updates.widget_ids ?? stack.widget_ids;
  check_stackable(database, user_id, widget_ids, stack.id);
  const pinned_paths = JSON.stringify(stack_updates.pinned_paths ?? stack.pinned_paths);
  const dropped_ids = stack.widget_ids.filter((widget_id) => !widget_ids.includes(widget_id));
  for (const widget_id of dropped_ids) {
    database.prepare('UPDATE widgets SET pinned_paths = ? WHERE id = ? AND user_id = ?').run(pinned_paths, widget_id, user_id);
  }
  if (widget_ids.length < 2) {
    database.prepare('UPDATE widget_stacks SET widget_ids = ?, pinned_paths = ? WHERE id = ?').run(JSON.stringify(widget_ids), pinned_paths, stack.id);
    delete_stack(database, user_id, stack.id);
    return null;
  }
  const requested_active_id = stack_updates.active_widget_id === undefined ? stack.active_widget_id : stack_updates.active_widget_id;
  const active_widget_id = widget_ids.includes(requested_active_id) ? requested_active_id : widget_ids[0];
  database
    .prepare(
      `UPDATE widget_stacks SET widget_ids = ?, view = ?, active_widget_id = ?, pinned_paths = ?, layout = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    )
    .run(
      JSON.stringify(widget_ids),
      stack_updates.view ?? stack.view,
      active_widget_id,
      pinned_paths,
      JSON.stringify(stack_updates.layout ?? stack.layout),
      stack.id,
    );
  return get_owned_stack(database, user_id, stack.id);
}

// Takes a deleted widget out of its stack, if it was in one.
export function remove_widget_from_stacks(database, user_id, widget_id) {
  const stack = find_widget_stack(database, user_id, widget_id);
  if (stack) update_stack(database, user_id, stack.id, { widget_ids: stack.widget_ids.filter((stacked_id) => stacked_id !== widget_id) });
}
