import { HTTP_STATUS, MAX_EXTRACTED_CHARACTERS, MIN_EXTRACTED_CHARACTERS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';

// Tidies text pulled from any source: one kind of line ending, single spaces, at most one
// blank line between paragraphs, no leading or trailing space.
export function normalize_extracted_text(raw_text) {
  return raw_text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Cuts text longer than MAX_EXTRACTED_CHARACTERS. Returns { text, is_truncated } so the
// caller can tell the student that only the first part was kept.
export function limit_text_length(text) {
  const is_truncated = text.length > MAX_EXTRACTED_CHARACTERS;
  return { text: is_truncated ? text.slice(0, MAX_EXTRACTED_CHARACTERS) : text, is_truncated };
}

// Throws a 422 with problem_message when there is too little text to study from.
export function assert_enough_text(text, problem_message) {
  if (text.length < MIN_EXTRACTED_CHARACTERS) {
    throw create_http_error(HTTP_STATUS.unprocessable, problem_message);
  }
}
