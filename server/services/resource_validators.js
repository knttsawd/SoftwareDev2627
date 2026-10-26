import { RESOURCE_TITLE_MAX_LENGTH, TYPED_NOTE_MAX_LENGTH, URL_MAX_LENGTH } from '../config/constants.js';

// Each validate_* function returns an error message, or null when the value is valid.

// Titles are optional for files and links (a name is filled in automatically) but required
// for typed notes.
export function validate_resource_title(title, { is_required = false } = {}) {
  if (title === undefined || title === null || (typeof title === 'string' && title.trim() === '')) {
    return is_required ? 'Title is required' : null;
  }
  if (typeof title !== 'string') return 'Title must be text';
  if (title.trim().length > RESOURCE_TITLE_MAX_LENGTH) {
    return `Title must be at most ${RESOURCE_TITLE_MAX_LENGTH} characters`;
  }
  return null;
}

export function validate_resource_url(url) {
  if (typeof url !== 'string' || url.trim() === '') return 'Link is required';
  if (url.trim().length > URL_MAX_LENGTH) return 'That link is too long';
  return null;
}

export function validate_typed_note_text(text) {
  if (typeof text !== 'string' || text.trim() === '') return 'Note text is required';
  if (text.length > TYPED_NOTE_MAX_LENGTH) return `Notes must be at most ${TYPED_NOTE_MAX_LENGTH} characters`;
  return null;
}

// The topic a new resource goes under is optional. Uploads send form fields as text, so
// a blank value means "no topic".
export function validate_resource_topic_id(topic_id) {
  if (topic_id === undefined || topic_id === null || topic_id === '') return null;
  return typeof topic_id === 'string' ? null : 'Choose a topic from the list';
}

// A trimmed topic id, or null for none.
export function clean_topic_id(topic_id) {
  return typeof topic_id === 'string' && topic_id.trim() !== '' ? topic_id.trim() : null;
}

// Trims a title, turning a blank one into null.
export function clean_title(title) {
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : null;
}

// Builds { field_errors, values } from a map of field name -> [error message or null, cleaned value].
function collect_results(field_results) {
  const field_errors = {};
  const values = {};
  for (const [field_name, [error_message, cleaned_value]] of Object.entries(field_results)) {
    if (error_message) field_errors[field_name] = error_message;
    else values[field_name] = cleaned_value;
  }
  return { field_errors, values };
}

export function validate_file_upload_input(input) {
  return collect_results({
    title: [validate_resource_title(input?.title), clean_title(input?.title)],
    topic_id: [validate_resource_topic_id(input?.topic_id), clean_topic_id(input?.topic_id)],
  });
}

export function validate_link_input(input) {
  return collect_results({
    url: [validate_resource_url(input?.url), input?.url?.trim?.()],
    title: [validate_resource_title(input?.title), clean_title(input?.title)],
    topic_id: [validate_resource_topic_id(input?.topic_id), clean_topic_id(input?.topic_id)],
  });
}

export function validate_typed_note_input(input) {
  return collect_results({
    title: [validate_resource_title(input?.title, { is_required: true }), clean_title(input?.title)],
    text: [validate_typed_note_text(input?.text), input?.text],
    topic_id: [validate_resource_topic_id(input?.topic_id), clean_topic_id(input?.topic_id)],
  });
}
