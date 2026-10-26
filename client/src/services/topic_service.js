import { send_authed_request } from './auth_service.js';

// { topics: [{ id, topic, summary, parent_node_id, mastery_score, mastery_level }],
//   suggestions: [{ topic_id, topic, mastery_level, reason }] }
export async function fetch_topic_map(skill_id) {
  return send_authed_request(`/skills/${skill_id}/topics`);
}

// topic_details: { topic, parent_topic_id? }. Returns the new topic.
export async function add_topic(skill_id, topic_details) {
  return send_authed_request(`/skills/${skill_id}/topics`, { method: 'POST', body: topic_details });
}

// Asks the AI to find topics in the skill's resources. Returns the updated topic map.
export async function generate_topics(skill_id) {
  return send_authed_request(`/skills/${skill_id}/topics/generate`, { method: 'POST' });
}

export async function delete_topic(topic_id) {
  return send_authed_request(`/topics/${topic_id}`, { method: 'DELETE' });
}

// topic_updates: { topic?, parent_topic_id? } to rename a topic or move it (with everything
// under it); parent_topic_id null makes it a main topic. Returns the updated topic.
export async function update_topic(topic_id, topic_updates) {
  return send_authed_request(`/topics/${topic_id}`, { method: 'PATCH', body: topic_updates });
}

// Asks the AI to break a topic into subtopics. Returns the updated topic map.
export async function generate_subtopics(topic_id) {
  return send_authed_request(`/topics/${topic_id}/generate`, { method: 'POST' });
}
