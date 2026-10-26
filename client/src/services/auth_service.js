import { HTTP_UNAUTHORIZED } from '../config/constants.js';
import { api_request } from './api_client.js';
import { announce_data_change, notify_session_ended } from '../utils/data_events.js';
import { clear_session_token, read_session_token, save_session_token } from './session_store.js';

const READ_ONLY_METHOD = 'GET';

export function is_logged_in() {
  return Boolean(read_session_token());
}

// Calls the API with the saved login token attached. Every signed-in request goes through
// this. A request that saves something tells the rest of the app (and other tabs) to
// refresh. A 401 means the session ended (expired, or logged out elsewhere), so the stale
// token is dropped and the app signs out before the error is passed on.
export async function send_authed_request(path, request_options = {}) {
  try {
    const response_body = await api_request(path, { ...request_options, access_token: read_session_token() });
    if ((request_options.method ?? READ_ONLY_METHOD) !== READ_ONLY_METHOD) announce_data_change();
    return response_body;
  } catch (request_error) {
    if (request_error.status === HTTP_UNAUTHORIZED) {
      clear_session_token();
      notify_session_ended();
    }
    throw request_error;
  }
}

export async function check_username_available(username) {
  const { is_available } = await api_request(`/auth/check-username?username=${encodeURIComponent(username)}`);
  return is_available;
}

// Creates the account and logs straight in. Returns the new account.
export async function sign_up(signup_details) {
  const { token, account } = await api_request('/auth/signup', { method: 'POST', body: signup_details });
  save_session_token(token);
  return account;
}

// Returns the account on success; throws "Incorrect email or password" otherwise.
export async function log_in(email, password) {
  const { token, account } = await api_request('/auth/login', { method: 'POST', body: { email, password } });
  save_session_token(token);
  return account;
}

// Ends the session on the server, and always forgets the token locally, even if the
// server could not be reached.
export async function log_out() {
  try {
    await send_authed_request('/auth/logout', { method: 'POST' });
  } finally {
    clear_session_token();
  }
}
