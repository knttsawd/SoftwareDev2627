import { API_BASE_URL, HTTP_NO_CONTENT } from '../config/constants.js';

// Builds the fetch headers: JSON content type when sending JSON, and the login token when
// given. File uploads (FormData) set their own content type, so is_json is false for them.
export function build_request_headers(is_json, access_token) {
  const request_headers = {};
  if (is_json) request_headers['Content-Type'] = 'application/json';
  if (access_token) request_headers.Authorization = `Bearer ${access_token}`;
  return request_headers;
}

// Sends a request to the StudyApp API and returns the parsed JSON body (null for 204).
// body may be a plain object (sent as JSON) or FormData (sent as a file upload).
// On failure it throws an Error with the server's message, plus status and field_errors
// so forms can show errors next to the right inputs.
export async function api_request(path, { method = 'GET', body, access_token } = {}) {
  const has_body = body !== undefined;
  const is_form_data = body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: build_request_headers(has_body && !is_form_data, access_token),
    body: has_body && !is_form_data ? JSON.stringify(body) : body,
  });

  if (response.status === HTTP_NO_CONTENT) return null;

  const response_body = await response.json().catch(() => null);
  if (!response.ok) {
    const request_error = new Error(response_body?.error || `Request failed with status ${response.status}`);
    request_error.status = response.status;
    request_error.field_errors = response_body?.field_errors ?? {};
    throw request_error;
  }
  return response_body;
}
