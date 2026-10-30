import { send_authed_request } from './auth_service.js';

// Events overlapping from-to (Dates), earliest first, each with skill_name and skill_color.
export async function fetch_events(from, to) {
  const range_query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return send_authed_request(`/events?${range_query}`);
}

export async function fetch_event(event_id) {
  return send_authed_request(`/events/${event_id}`);
}

// event_details: { title, starts_at, ends_at, details?, skill_id? } with ISO date-times.
export async function create_event(event_details) {
  return send_authed_request('/events', { method: 'POST', body: event_details });
}

export async function update_event(event_id, event_updates) {
  return send_authed_request(`/events/${event_id}`, { method: 'PATCH', body: event_updates });
}

export async function delete_event(event_id) {
  return send_authed_request(`/events/${event_id}`, { method: 'DELETE' });
}

// block_details: { activity: "quiz" | "assignment", event_id?, skill_id? }. Ends any running block.
export async function start_work_block(block_details) {
  return send_authed_request('/work-blocks', { method: 'POST', body: block_details });
}

// The unfinished work block, or null.
export async function fetch_active_work_block() {
  const { work_block } = await send_authed_request('/work-blocks/active');
  return work_block;
}

// finish_details: { completed_minutes, activity }.
export async function finish_work_block(work_block_id, finish_details) {
  return send_authed_request(`/work-blocks/${work_block_id}/finish`, { method: 'POST', body: finish_details });
}
