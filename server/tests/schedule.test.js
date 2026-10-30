import { beforeEach, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { create_event, delete_event, get_owned_event, list_events, update_event } from '../services/event_service.js';
import {
  to_iso_timestamp,
  validate_event_details,
  validate_event_input,
  validate_event_range,
  validate_event_times,
  validate_event_title,
} from '../services/event_validators.js';
import { create_skill, list_skills } from '../services/skill_service.js';
import { add_topic } from '../services/topic_service.js';
import {
  count_completed_minutes,
  finish_work_block,
  get_active_work_block,
  get_owned_work_block,
  start_work_block,
  validate_activity,
  validate_planned_minutes,
} from '../services/work_block_service.js';
import { create_student_with_skill } from './helpers/study_fixtures.js';
import { create_test_account } from './helpers/test_accounts.js';

const MONDAY_10AM = '2026-10-26T10:00:00.000Z';
const MONDAY_11AM = '2026-10-26T11:00:00.000Z';

let database;
let user_id;
let skill;

beforeEach(async () => {
  database = open_database(IN_MEMORY_DATABASE);
  ({ user_id, skill } = await create_student_with_skill(database));
});

// Saves a study event for the test student, with any fields overridden.
function add_event(overrides = {}) {
  return create_event(database, user_id, {
    title: 'Study cells',
    skill_id: skill.id,
    starts_at: MONDAY_10AM,
    ends_at: MONDAY_11AM,
    ...overrides,
  });
}

describe('event validators', () => {
  it('turns any date-time into one ISO format, or null', () => {
    expect(to_iso_timestamp('2026-10-26T10:00:00+02:00')).toBe('2026-10-26T08:00:00.000Z');
    expect(to_iso_timestamp('not a date')).toBeNull();
    expect(to_iso_timestamp(undefined)).toBeNull();
  });

  it('check titles, details and times', () => {
    expect(validate_event_title(' ')).toBe('Title is required');
    expect(validate_event_title('x'.repeat(121))).toMatch('at most 120');
    expect(validate_event_details(undefined)).toBeNull();
    expect(validate_event_details(5)).toBe('Details must be text');
    expect(validate_event_times(MONDAY_10AM, MONDAY_11AM)).toEqual({});
    expect(validate_event_times(MONDAY_11AM, MONDAY_10AM)).toEqual({ ends_at: 'The end must be after the start' });
    expect(validate_event_times(MONDAY_10AM, '2026-10-28T10:00:00.000Z')).toEqual({ ends_at: 'An event can last at most 24 hours' });
    expect(validate_event_times(null, MONDAY_11AM)).toEqual({ starts_at: 'Choose a start date and time' });
  });

  it('validate new events', () => {
    expect(
      validate_event_input({ title: ' Study ', starts_at: MONDAY_10AM, ends_at: MONDAY_11AM, details: ' Ch. 4 ', skill_id: 's1' }),
    ).toEqual({
      field_errors: {},
      values: { title: 'Study', details: 'Ch. 4', skill_id: 's1', starts_at: MONDAY_10AM, ends_at: MONDAY_11AM },
    });
    expect(Object.keys(validate_event_input({}).field_errors)).toEqual(['title', 'starts_at']);
  });

  it('validate edits against the current times', () => {
    const current_event = { starts_at: MONDAY_10AM, ends_at: MONDAY_11AM };

    expect(validate_event_input({ skill_id: null }, { is_partial: true, current_event }).values).toEqual({ skill_id: null });
    expect(validate_event_input({ ends_at: '2026-10-26T09:00:00.000Z' }, { is_partial: true, current_event }).field_errors).toEqual({
      ends_at: 'The end must be after the start',
    });
    expect(validate_event_input({}, { is_partial: true, current_event }).field_errors).toEqual({ form: 'Nothing to update' });
  });

  it('validate listing ranges', () => {
    expect(validate_event_range({ from: MONDAY_10AM, to: MONDAY_11AM })).toEqual({ from: MONDAY_10AM, to: MONDAY_11AM });
    expect(validate_event_range({ from: MONDAY_10AM })).toEqual({ error: 'Send a from and to date-time' });
    expect(validate_event_range({ from: MONDAY_11AM, to: MONDAY_10AM }).error).toMatch('after');
    expect(validate_event_range({ from: '2026-01-01T00:00:00Z', to: '2026-06-01T00:00:00Z' }).error).toMatch('at most 62 days');
  });
});

describe('event service', () => {
  it('creates events with the subject name and color', () => {
    expect(add_event()).toMatchObject({ title: 'Study cells', skill_name: 'Biology', skill_color: '#4F46E5' });
  });

  it('lists events that overlap the range, earliest first', () => {
    add_event({ title: 'Later', starts_at: '2026-10-26T15:00:00.000Z', ends_at: '2026-10-26T16:00:00.000Z' });
    add_event({ title: 'Overnight', starts_at: '2026-10-25T23:00:00.000Z', ends_at: '2026-10-26T01:00:00.000Z' });
    add_event({ title: 'Next week', starts_at: '2026-11-03T10:00:00.000Z', ends_at: '2026-11-03T11:00:00.000Z' });

    const events = list_events(database, user_id, '2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z');

    expect(events.map((event) => event.title)).toEqual(['Overnight', 'Later']);
  });

  it("refuses another student's skill and hides other students' events", async () => {
    const { id: other_user_id } = await create_test_account(database, { username: 'other', email: 'o@example.com' });
    const other_skill = create_skill(database, other_user_id, { name: 'Art' });
    const event = add_event();

    expect(() => add_event({ skill_id: other_skill.id })).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => get_owned_event(database, other_user_id, event.id)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('updates and deletes events', () => {
    const event = add_event();

    expect(update_event(database, user_id, event.id, { title: 'Review', skill_id: null })).toMatchObject({
      title: 'Review',
      skill_id: null,
      skill_name: null,
    });
    delete_event(database, user_id, event.id);
    expect(() => get_owned_event(database, user_id, event.id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('skill topic counts for the planner', () => {
  it('counts topics, weak topics and untested topics', () => {
    const weak_topic = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    add_topic(database, user_id, skill.id, { topic: 'Genes' });
    database.prepare('UPDATE skill_nodes SET mastery_score = 30 WHERE id = ?').run(weak_topic.id);

    expect(list_skills(database, user_id)[0]).toMatchObject({ topic_count: 2, weak_topic_count: 1, untested_topic_count: 1 });
  });
});

describe('work block validators', () => {
  it('check the activity and length', () => {
    expect(validate_activity('quiz')).toBeNull();
    expect(validate_activity('nap')).toMatch('quiz, assignment');
    expect(validate_planned_minutes(undefined)).toBeNull();
    expect(validate_planned_minutes(25)).toBeNull();
    expect(validate_planned_minutes(2)).toMatch('between 5 and 120');
  });

  it('count whole elapsed minutes, never more than planned', () => {
    const work_block = { started_at: MONDAY_10AM, planned_minutes: 25 };

    expect(count_completed_minutes(work_block, new Date('2026-10-26T10:10:30.000Z'))).toBe(10);
    expect(count_completed_minutes(work_block, new Date('2026-10-26T12:00:00.000Z'))).toBe(25);
    expect(count_completed_minutes(work_block, new Date('2026-10-26T09:00:00.000Z'))).toBe(0);
  });
});

describe('work block service', () => {
  it('starts a block from an event, taking its subject and the student timer length', () => {
    const event = add_event();

    const work_block = start_work_block(database, user_id, { activity: 'assignment', event_id: event.id }, new Date(MONDAY_10AM));

    expect(work_block).toMatchObject({
      event_id: event.id,
      skill_id: skill.id,
      event_title: 'Study cells',
      skill_name: 'Biology',
      activity: 'assignment',
      planned_minutes: 25,
      break_minutes: 5,
      started_at: MONDAY_10AM,
      ended_at: null,
    });
    expect(get_active_work_block(database, user_id).id).toBe(work_block.id);
  });

  it('ends any running block when a new one starts', () => {
    const first_block = start_work_block(database, user_id, { activity: 'quiz', planned_minutes: 30 }, new Date(MONDAY_10AM));

    start_work_block(database, user_id, { activity: 'quiz' }, new Date('2026-10-26T10:12:00.000Z'));

    expect(get_owned_work_block(database, user_id, first_block.id)).toMatchObject({ completed_minutes: 12 });
    expect(get_owned_work_block(database, user_id, first_block.id).ended_at).not.toBeNull();
  });

  it('finishes a block once, capping the minutes at the plan', () => {
    const work_block = start_work_block(database, user_id, { activity: 'quiz' }, new Date(MONDAY_10AM));

    const finished_block = finish_work_block(database, user_id, work_block.id, { completed_minutes: 99, activity: 'assignment' });

    expect(finished_block).toMatchObject({ completed_minutes: 25, activity: 'assignment' });
    expect(get_active_work_block(database, user_id)).toBeNull();
    expect(() => finish_work_block(database, user_id, work_block.id, {})).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("refuses other students' events and skills", async () => {
    const { id: other_user_id } = await create_test_account(database, { username: 'other', email: 'o@example.com' });
    const event = add_event();

    expect(() => start_work_block(database, other_user_id, { activity: 'quiz', event_id: event.id })).toThrow(
      expect.objectContaining({ status: 404 }),
    );
    expect(() => start_work_block(database, other_user_id, { activity: 'quiz', skill_id: skill.id })).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });
});
