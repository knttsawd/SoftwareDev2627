import { HTTP_STATUS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { get_owned_skill } from '../skill_service.js';

// Small helpers shared by the assistant's tools. Every tool is
//   { name, description, parameters, effect, needs_confirmation?, label(args, context), run(context, args) }
// where
//   parameters  { name: "type, required or optional: what it is" }, shown to the AI
//   effect      "read" (looks only), "write" (changes the student's data) or "navigate"
//   needs_confirmation  true for deleting: the student confirms in the panel first
//   label       a short line for the panel, like 'Create the skill "Biology"'
//   run         does it with context { database, ai_provider, resource_importer,
//               uploads_path, user_id, now } and returns { summary, data?, link?,
//               widget_id?, client_action? }. Errors are reported back to the AI.

// The values from a validate_*_input result, or a 400 listing what's wrong, which the AI
// reads and can fix.
export function take_values({ field_errors, values }) {
  const problems = Object.entries(field_errors);
  if (problems.length > 0) {
    throw create_http_error(HTTP_STATUS.bad_request, problems.map(([field_name, problem]) => `${field_name}: ${problem}`).join('; '));
  }
  return values;
}

// The student's skill, or a clear error when skill_id is missing or someone else's.
export function require_skill(context, skill_id) {
  if (typeof skill_id !== 'string' || !skill_id) throw create_http_error(HTTP_STATUS.bad_request, 'skill_id is required');
  return get_owned_skill(context.database, context.user_id, skill_id);
}

// Text cut to max_length, with "…" when something was cut.
export function cut_text(text, max_length) {
  if (typeof text !== 'string') return '';
  return text.length > max_length ? `${text.slice(0, max_length)}…` : text;
}

// The named fields of args that were sent, for partial updates.
export function pick_sent(args, field_names) {
  return Object.fromEntries(field_names.filter((field_name) => args[field_name] !== undefined).map((field_name) => [field_name, args[field_name]]));
}

// "the skill "Biology"" for labels, falling back to the id if it can't be found.
export function name_skill(context, skill_id) {
  try {
    return `"${get_owned_skill(context.database, context.user_id, skill_id).name}"`;
  } catch {
    return String(skill_id);
  }
}

// "2 items" / "1 item"; plural is for nouns that don't just add an s.
export function count_words(count, noun, plural = `${noun}s`) {
  return `${count} ${count === 1 ? noun : plural}`;
}
