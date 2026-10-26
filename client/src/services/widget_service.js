import { send_authed_request } from './auth_service.js';

// Widgets the assistant made: { id, title, kind ("card" | "app"), spec, state, pinned_paths,
// layout, created_at, updated_at }, and smart stacks of them: { id, widget_ids, view
// ("swipe" | "list"), active_widget_id, pinned_paths, layout }. A layout is { width, height,
// is_collapsed, position, mode, anchor, x, y, float_width, float_height, appearance, accent }
// (see DEFAULT_WIDGET_LAYOUT in server/config/constants.js). See
// server/services/widget_specs.js for what a spec holds.

export async function fetch_widgets() {
  return send_authed_request('/widgets');
}

// widget_updates: any of { title, state, pinned_paths, layout }. Returns the updated widget.
export async function update_widget(widget_id, widget_updates) {
  return send_authed_request(`/widgets/${widget_id}`, { method: 'PATCH', body: widget_updates });
}

// Saves the order of the docked items on a page: items is [{ type: "widget" | "stack", id }],
// and each one's position becomes its index.
export async function order_widgets(items) {
  return send_authed_request('/widgets/order', { method: 'PUT', body: { items } });
}

export async function delete_widget(widget_id) {
  return send_authed_request(`/widgets/${widget_id}`, { method: 'DELETE' });
}

// A live block's data: { source, items: [{ label, detail, starts_at?, link? }] }.
export async function fetch_live_widget_data(source, skill_id) {
  const query = skill_id ? `?${new URLSearchParams({ skill_id })}` : '';
  return send_authed_request(`/widgets/live/${source}${query}`);
}

export async function fetch_widget_stacks() {
  return send_authed_request('/widget-stacks');
}

// stack_details: { widget_ids, view?, pinned_paths?, layout? }. Returns the new stack.
export async function create_widget_stack(stack_details) {
  return send_authed_request('/widget-stacks', { method: 'POST', body: stack_details });
}

// stack_updates: any of { widget_ids, view, active_widget_id, pinned_paths, layout }.
// Returns { stack }, where stack is null if one widget was left and it was taken apart.
export async function update_widget_stack(stack_id, stack_updates) {
  return send_authed_request(`/widget-stacks/${stack_id}`, { method: 'PATCH', body: stack_updates });
}

// Takes a stack apart; its widgets are kept.
export async function delete_widget_stack(stack_id) {
  return send_authed_request(`/widget-stacks/${stack_id}`, { method: 'DELETE' });
}
