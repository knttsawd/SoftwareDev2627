import { send_authed_request } from './auth_service.js';
import { clear_session_token } from './session_store.js';

export async function fetch_account() {
  return send_authed_request('/account');
}

// account_updates may hold any of username, email, password, first_name, last_name,
// work_minutes and break_minutes. Changing the email or password also needs current_password.
export async function update_account(account_updates) {
  return send_authed_request('/account', { method: 'PATCH', body: account_updates });
}

// Deletes the account on the server (the password confirms it), then forgets the token.
// If the server delete fails, the student stays logged in.
export async function delete_account(password) {
  await send_authed_request('/account', { method: 'DELETE', body: { password } });
  clear_session_token();
}
