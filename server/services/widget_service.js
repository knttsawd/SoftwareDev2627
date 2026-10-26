import { randomUUID } from 'node:crypto';
import {
  DEFAULT_WIDGET_LAYOUT,
  HTTP_STATUS,
  MAX_LIVE_ITEMS,
  MAX_UPCOMING_EVENTS,
  MAX_WIDGETS,
  MS_PER_DAY,
  UPCOMING_DAYS,
  WIDGET_LIVE_SOURCES,
} from '../config/constants.js';
import { list_events } from './event_service.js';
import { create_http_error } from './http_error.js';
import { get_learning_path } from './learning_path_service.js';
import { rank_study_suggestions } from './mastery.js';
import { get_progress } from './progress_service.js';
import { get_owned_skill, list_skills } from './skill_service.js';
import { list_topics } from './topic_service.js';
import { get_owned_stack, remove_widget_from_stacks } from './widget_stack_service.js';

// Widgets the assistant makes for the student: cards built from safe blocks, or small
// sandboxed apps (see widget_specs.js). Each can be pinned to every dashboard page or a
// list of them (pinned_paths). Live blocks show the student's own data, worked out here each time.

const WIDGET_COLUMNS = 'id, title, kind, spec, state, pinned_paths, layout, created_at, updated_at';

// A widget with its JSON parsed, and every layout setting filled in (older widgets have none).
export function to_widget(widget_row) {
  return {
    ...widget_row,
    spec: JSON.parse(widget_row.spec),
    state: JSON.parse(widget_row.state),
    pinned_paths: JSON.parse(widget_row.pinned_paths),
    layout: { ...DEFAULT_WIDGET_LAYOUT, ...JSON.parse(widget_row.layout) },
  };
}

// Newest first.
export function list_widgets(database, user_id) {
  return database
    .prepare(`SELECT ${WIDGET_COLUMNS} FROM widgets WHERE user_id = ? ORDER BY created_at DESC, rowid DESC`)
    .all(user_id)
    .map(to_widget);
}

export function get_owned_widget(database, user_id, widget_id) {
  const widget_row = database.prepare(`SELECT ${WIDGET_COLUMNS} FROM widgets WHERE id = ? AND user_id = ?`).get(widget_id, user_id);
  if (!widget_row) throw create_http_error(HTTP_STATUS.not_found, 'Widget not found');
  return to_widget(widget_row);
}

// Saves a checked widget (validate_new_widget's values). A student can have MAX_WIDGETS.
export function create_widget(database, user_id, { title, kind, spec, pinned_paths = [], layout = DEFAULT_WIDGET_LAYOUT }) {
  const { widget_count } = database.prepare('SELECT count(*) AS widget_count FROM widgets WHERE user_id = ?').get(user_id);
  if (widget_count >= MAX_WIDGETS) {
    throw create_http_error(HTTP_STATUS.conflict, `You can have at most ${MAX_WIDGETS} widgets. Delete one to make another.`);
  }
  const widget_id = randomUUID();
  database
    .prepare('INSERT INTO widgets (id, user_id, title, kind, spec, pinned_paths, layout) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(widget_id, user_id, title, kind, JSON.stringify(spec), JSON.stringify(pinned_paths), JSON.stringify(layout));
  return get_owned_widget(database, user_id, widget_id);
}

// Applies checked updates (validate_widget_updates' values). Column names come only from
// this fixed list. JSON fields are stored as text.
const UPDATABLE_COLUMNS = ['title', 'spec', 'state', 'pinned_paths', 'layout'];
export function update_widget(database, user_id, widget_id, widget_updates) {
  get_owned_widget(database, user_id, widget_id);
  const columns = UPDATABLE_COLUMNS.filter((column_name) => widget_updates[column_name] !== undefined);
  const values = columns.map((column_name) =>
    typeof widget_updates[column_name] === 'object' && widget_updates[column_name] !== null
      ? JSON.stringify(widget_updates[column_name])
      : widget_updates[column_name],
  );
  database
    .prepare(`UPDATE widgets SET ${columns.map((column_name) => `${column_name} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
    .run(...values, widget_id);
  return get_owned_widget(database, user_id, widget_id);
}

// Where each kind of item's layout is kept, and how to look one up.
const ORDERED_ITEM_SOURCES = {
  widget: { table_name: 'widgets', get_owned: get_owned_widget },
  stack: { table_name: 'widget_stacks', get_owned: get_owned_stack },
};

// Puts the docked widgets and stacks on a page in the order of items ([{ type, id }]):
// each gets its index as its position, all or nothing. Every item must be the student's.
export function order_layout_items(database, user_id, items) {
  const owned_items = items.map((item) => ({ ...item, layout: ORDERED_ITEM_SOURCES[item.type].get_owned(database, user_id, item.id).layout }));
  database.exec('BEGIN');
  try {
    owned_items.forEach((item, position) => {
      const { table_name } = ORDERED_ITEM_SOURCES[item.type];
      database.prepare(`UPDATE ${table_name} SET layout = ? WHERE id = ?`).run(JSON.stringify({ ...item.layout, position }), item.id);
    });
    database.exec('COMMIT');
  } catch (order_error) {
    database.exec('ROLLBACK');
    throw order_error;
  }
}

// Deletes a widget, taking it out of its stack first if it's in one.
export function delete_widget(database, user_id, widget_id) {
  get_owned_widget(database, user_id, widget_id);
  database.prepare('DELETE FROM widgets WHERE id = ?').run(widget_id);
  remove_widget_from_stacks(database, user_id, widget_id);
}

// The skills a live block covers: the one asked for (it must be the student's), or all.
function pick_skills(database, user_id, skill_id) {
  return skill_id ? [get_owned_skill(database, user_id, skill_id)] : list_skills(database, user_id);
}

// Each live source's items, all in one shape the client can show as a list:
// [{ label, detail, starts_at?, link? }], at most MAX_LIVE_ITEMS.
const LIVE_SOURCES = {
  weak_topics: (database, user_id, { skill_id }) =>
    pick_skills(database, user_id, skill_id).flatMap((skill) =>
      rank_study_suggestions(list_topics(database, user_id, skill.id)).map((suggestion) => ({
        label: suggestion.topic,
        detail: `${skill.name} · ${suggestion.reason}`,
        link: `/dashboard/learn?skill=${skill.id}&tab=lessons&topic=${suggestion.topic_id}`,
      })),
    ),
  upcoming_events: (database, user_id, { now }) =>
    list_events(database, user_id, now.toISOString(), new Date(now.getTime() + UPCOMING_DAYS * MS_PER_DAY).toISOString())
      .slice(0, MAX_UPCOMING_EVENTS)
      .map((event) => ({ label: event.title, detail: event.skill_name ?? '', starts_at: event.starts_at, link: '/dashboard/schedule' })),
  progress_summary: (database, user_id, { now }) => {
    const { quiz_scores, study_minutes, totals } = get_progress(database, user_id, now);
    return [
      { label: 'Average quiz score', detail: quiz_scores.recent === null ? 'No quizzes in the last 30 days' : `${quiz_scores.recent}% over 30 days` },
      { label: 'Focus time', detail: `${study_minutes.recent ?? 0} minutes over 7 days` },
      { label: 'Strong topics', detail: `${totals.topics_strong} of ${totals.topics_total}` },
    ].map((item) => ({ ...item, link: '/dashboard/progress' }));
  },
  learning_path_next: (database, user_id, { skill_id }) =>
    pick_skills(database, user_id, skill_id).flatMap((skill) =>
      get_learning_path(database, user_id, skill)
        .steps.filter((path_step) => path_step.status !== 'done')
        .map((path_step) => ({
          label: path_step.topic,
          detail: `${skill.name}${path_step.status === 'next' ? ' · next up' : ''}`,
          link: `/dashboard/learn?skill=${skill.id}&tab=path`,
        })),
    ),
  recent_results: (database, user_id, { skill_id }) =>
    database
      .prepare(
        `SELECT quizzes.id AS quiz_id, quizzes.topic, skills.name AS skill_name, quiz_results.score
         FROM quiz_results JOIN quizzes ON quizzes.id = quiz_results.quiz_id JOIN skills ON skills.id = quizzes.skill_id
         WHERE quiz_results.user_id = ? AND quiz_results.taker = 'student' AND (? IS NULL OR quizzes.skill_id = ?)
         ORDER BY quiz_results.completed_at DESC, quiz_results.rowid DESC LIMIT ?`,
      )
      .all(user_id, skill_id, skill_id, MAX_LIVE_ITEMS)
      .map((result_row) => ({
        label: result_row.topic,
        detail: `${Math.round(result_row.score)}% · ${result_row.skill_name}`,
        link: `/dashboard/quiz?quiz=${result_row.quiz_id}`,
      })),
};

// A live block's data: { source, items }. skill_id (optional) narrows it to one skill.
export function get_live_widget_data(database, user_id, { source, skill_id = null, now = new Date() }) {
  if (!WIDGET_LIVE_SOURCES.includes(source)) {
    throw create_http_error(HTTP_STATUS.bad_request, `Choose one of: ${WIDGET_LIVE_SOURCES.join(', ')}`);
  }
  if (skill_id) get_owned_skill(database, user_id, skill_id);
  return { source, items: LIVE_SOURCES[source](database, user_id, { skill_id, now }).slice(0, MAX_LIVE_ITEMS) };
}
