import { send_authed_request } from './auth_service.js';

// Resource summaries for a skill: [{ id, topic_id, title, resource_type, source_url, character_count, created_at }].
// topic_id is the skill-map topic the resource is filed under, or null.
export async function fetch_resources(skill_id) {
  return send_authed_request(`/skills/${skill_id}/resources`);
}

// Uploads a PDF, text, Markdown, audio or video file. title and topic_id are optional.
// Every add_* function returns the new resource summary plus is_truncated.
export async function upload_resource_file(skill_id, file, title, topic_id) {
  const upload_form = new FormData();
  upload_form.append('file', file);
  if (title) upload_form.append('title', title);
  if (topic_id) upload_form.append('topic_id', topic_id);
  return send_authed_request(`/skills/${skill_id}/resources/files`, { method: 'POST', body: upload_form });
}

// Adds an article or YouTube link. link_details: { url, title?, topic_id? }
export async function add_resource_link(skill_id, link_details) {
  return send_authed_request(`/skills/${skill_id}/resources/links`, { method: 'POST', body: link_details });
}

// Adds typed or pasted notes. note_details: { title, text, topic_id? }
export async function add_resource_text(skill_id, note_details) {
  return send_authed_request(`/skills/${skill_id}/resources/text`, { method: 'POST', body: note_details });
}

// Files a resource under a topic, or takes it out of its topic with null. Returns the updated summary.
export async function move_resource_to_topic(resource_id, topic_id) {
  return send_authed_request(`/resources/${resource_id}`, { method: 'PATCH', body: { topic_id } });
}

export async function delete_resource(resource_id) {
  return send_authed_request(`/resources/${resource_id}`, { method: 'DELETE' });
}
