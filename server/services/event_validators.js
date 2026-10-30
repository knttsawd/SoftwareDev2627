import {
  EVENT_DETAILS_MAX_LENGTH,
  EVENT_TITLE_MAX_LENGTH,
  MAX_EVENT_MINUTES,
  MAX_EVENT_RANGE_DAYS,
  MS_PER_DAY,
  MS_PER_MINUTE,
} from '../config/constants.js';
import { validate_optional_id } from './study_validators.js';

// Each validate_* function returns an error message, or null when the value is valid.

// Turns any date-time text the Date parser accepts into the one ISO format the database
// uses ("2026-10-24T17:00:00.000Z"), so stored times compare correctly as text.
// Returns null for anything that isn't a date-time.
export function to_iso_timestamp(timestamp_text) {
  if (typeof timestamp_text !== 'string' || timestamp_text.trim() === '') return null;
  const parsed_date = new Date(timestamp_text);
  return Number.isNaN(parsed_date.getTime()) ? null : parsed_date.toISOString();
}

export function validate_event_title(title) {
  if (typeof title !== 'string' || title.trim() === '') return 'Title is required';
  if (title.trim().length > EVENT_TITLE_MAX_LENGTH) return `Title must be at most ${EVENT_TITLE_MAX_LENGTH} characters`;
  return null;
}

export function validate_event_details(details) {
  if (details === undefined || details === null || details === '') return null;
  if (typeof details !== 'string') return 'Details must be text';
  if (details.length > EVENT_DETAILS_MAX_LENGTH) return `Details must be at most ${EVENT_DETAILS_MAX_LENGTH} characters`;
  return null;
}

// The end must come after the start, and an event can't last more than a day.
export function validate_event_times(starts_at, ends_at) {
  if (!starts_at) return { starts_at: 'Choose a start date and time' };
  if (!ends_at) return { ends_at: 'Choose an end date and time' };
  const duration_minutes = (new Date(ends_at) - new Date(starts_at)) / MS_PER_MINUTE;
  if (duration_minutes <= 0) return { ends_at: 'The end must be after the start' };
  if (duration_minutes > MAX_EVENT_MINUTES) return { ends_at: 'An event can last at most 24 hours' };
  return {};
}

// Validates a new event (title, starts_at and ends_at required) or, with is_partial and the
// event's current times, an edit (any fields, at least one). skill_id may be null to clear
// the subject. Returns { field_errors, values } with times in ISO form.
export function validate_event_input(input, { is_partial = false, current_event = null } = {}) {
  const field_errors = {};
  const values = {};
  const is_sent = (field_name) => input?.[field_name] !== undefined;

  if (is_partial && !['title', 'details', 'skill_id', 'starts_at', 'ends_at'].some(is_sent)) {
    return { field_errors: { form: 'Nothing to update' }, values };
  }
  if (!is_partial || is_sent('title')) {
    const title_error = validate_event_title(input?.title);
    if (title_error) field_errors.title = title_error;
    else values.title = input.title.trim();
  }
  if (is_sent('details')) {
    const details_error = validate_event_details(input.details);
    if (details_error) field_errors.details = details_error;
    else values.details = input.details?.trim() || null;
  }
  if (is_sent('skill_id')) {
    const skill_error = validate_optional_id(input.skill_id);
    if (skill_error) field_errors.skill_id = skill_error;
    else values.skill_id = input.skill_id;
  }
  if (!is_partial || is_sent('starts_at') || is_sent('ends_at')) {
    const starts_at = is_sent('starts_at') ? to_iso_timestamp(input.starts_at) : current_event?.starts_at;
    const ends_at = is_sent('ends_at') ? to_iso_timestamp(input.ends_at) : current_event?.ends_at;
    const time_errors = validate_event_times(starts_at, ends_at);
    Object.assign(field_errors, time_errors);
    if (Object.keys(time_errors).length === 0) Object.assign(values, { starts_at, ends_at });
  }
  return { field_errors, values };
}

// The ?from=&to= range for listing events. Returns { error } or { from, to } in ISO form.
export function validate_event_range(query) {
  const from = to_iso_timestamp(query?.from);
  const to = to_iso_timestamp(query?.to);
  if (!from || !to) return { error: 'Send a from and to date-time' };
  const range_days = (new Date(to) - new Date(from)) / MS_PER_DAY;
  if (range_days <= 0) return { error: '"to" must be after "from"' };
  if (range_days > MAX_EVENT_RANGE_DAYS) return { error: `Ask for at most ${MAX_EVENT_RANGE_DAYS} days at a time` };
  return { from, to };
}
