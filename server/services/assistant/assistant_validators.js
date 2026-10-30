import { ASSISTANT_MESSAGE_MAX_LENGTH, ASSISTANT_PAGE_MAX_LENGTH, MINUTES_PER_UTC_OFFSET_LIMIT } from '../../config/constants.js';

// A message to the assistant: { message, page?, utc_offset_minutes? }. page is where the
// student is ("/dashboard/learn?skill=..."), and utc_offset_minutes their time zone's offset
// (e.g. 60 for UTC+01:00), so "tomorrow at 5" means their 5. Returns { field_errors, values }.
export function validate_assistant_input(input) {
  const field_errors = {};
  const message = typeof input?.message === 'string' ? input.message.trim() : '';
  if (!message) field_errors.message = 'Type a message first';
  else if (message.length > ASSISTANT_MESSAGE_MAX_LENGTH) field_errors.message = `Keep messages under ${ASSISTANT_MESSAGE_MAX_LENGTH} characters`;

  const page = input?.page ?? '/dashboard';
  if (typeof page !== 'string' || !page.startsWith('/') || page.length > ASSISTANT_PAGE_MAX_LENGTH) field_errors.page = 'page must be the address of the current page';

  const utc_offset_minutes = input?.utc_offset_minutes ?? 0;
  if (!Number.isInteger(utc_offset_minutes) || Math.abs(utc_offset_minutes) > MINUTES_PER_UTC_OFFSET_LIMIT) {
    field_errors.utc_offset_minutes = 'utc_offset_minutes must be a whole number of minutes';
  }
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return { field_errors, values: { message, page, utc_offset_minutes } };
}
