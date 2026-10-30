import { HTTP_STATUS } from '../config/constants.js';

// Builds an Error that handle_errors turns into a JSON response with the given status and
// message. extra_body fields (e.g. field_errors) are merged into the response body.
// cause is the underlying error, logged by handle_errors for 5xx responses but never sent
// to the client.
export function create_http_error(status, message, extra_body = {}, cause = undefined) {
  const http_error = new Error(message, { cause });
  http_error.status = status;
  http_error.extra_body = extra_body;
  http_error.is_http_error = true;
  return http_error;
}

// Throws a 400 carrying field_errors when a validator found problems, so forms can show
// each message next to the right input.
export function assert_no_field_errors(field_errors) {
  if (Object.keys(field_errors).length > 0) {
    throw create_http_error(HTTP_STATUS.bad_request, 'Please fix the highlighted fields', { field_errors });
  }
}
