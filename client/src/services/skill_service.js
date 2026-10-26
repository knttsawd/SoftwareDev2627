import { send_authed_request } from './auth_service.js';

// [{ id, name, color, created_at, resource_count }], oldest first.
export async function fetch_skills() {
  return send_authed_request('/skills');
}

// skill_details: { name, color? }
export async function create_skill(skill_details) {
  return send_authed_request('/skills', { method: 'POST', body: skill_details });
}

// skill_updates: { name?, color? }
export async function update_skill(skill_id, skill_updates) {
  return send_authed_request(`/skills/${skill_id}`, { method: 'PATCH', body: skill_updates });
}

// Also deletes every resource, note and quiz in the skill.
export async function delete_skill(skill_id) {
  return send_authed_request(`/skills/${skill_id}`, { method: 'DELETE' });
}
