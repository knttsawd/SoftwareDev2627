import { send_authed_request } from './auth_service.js';

// The assistant on every page. A message is { id, role ("user" | "assistant"), content,
// actions: [{ id, tool, label, status ("done" | "failed" | "pending" | "cancelled"),
// summary, link, widget_id }], created_at }.

// { messages, assistant_id, assistants: [{ id, label, description }] }
export async function fetch_assistant() {
  return send_authed_request('/assistant');
}

// The student's time zone offset in minutes (60 for UTC+01:00), so "tomorrow at 5" means
// their 5 o'clock.
export function get_utc_offset_minutes(date = new Date()) {
  return -date.getTimezoneOffset();
}

// Sends a message from the page at page_path. Returns { user_message, assistant_message,
// client_actions: [{ type: "navigate", path }], data_changed }.
export async function send_assistant_message(message, page_path) {
  return send_authed_request('/assistant/messages', {
    method: 'POST',
    body: { message, page: page_path, utc_offset_minutes: get_utc_offset_minutes() },
  });
}

export async function clear_assistant() {
  return send_authed_request('/assistant/messages', { method: 'DELETE' });
}

export async function choose_assistant(assistant_id) {
  return send_authed_request('/assistant/settings', { method: 'PUT', body: { assistant_id } });
}

// Runs an action that was waiting for the student. Returns { message, client_actions, data_changed }.
export async function confirm_assistant_action(message_id, action_id) {
  return send_authed_request(`/assistant/messages/${message_id}/actions/${action_id}/confirm`, { method: 'POST' });
}

// Returns { message }.
export async function cancel_assistant_action(message_id, action_id) {
  return send_authed_request(`/assistant/messages/${message_id}/actions/${action_id}/cancel`, { method: 'POST' });
}
