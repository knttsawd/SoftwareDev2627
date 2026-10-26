import { ROUTE_PATHS } from '../config/constants.js';

// Addresses of dashboard pages set up for one piece of study, so links from the skill map
// open the right quiz or chat. Values are encoded because they go into a query string.

// The quiz page with a skill-map topic or one resource already chosen.
export function build_quiz_path({ skill_id, topic_id, resource_id }) {
  const query = new URLSearchParams({ skill: skill_id });
  if (topic_id) query.set('topic', topic_id);
  if (resource_id) query.set('resource', resource_id);
  return `${ROUTE_PATHS.dashboard}/quiz?${query}`;
}

// The Teach the AI student page: a lesson to continue or review (session_id), or the
// setup form with a skill and topic chosen.
export function build_teach_path({ skill_id, topic_id, session_id }) {
  const query = new URLSearchParams();
  if (session_id) query.set('session', session_id);
  if (skill_id) query.set('skill', skill_id);
  if (topic_id) query.set('topic', topic_id);
  const query_text = query.toString();
  return `${ROUTE_PATHS.dashboard}/teach${query_text ? `?${query_text}` : ''}`;
}

// The Learn page's query keys.
export const LEARN_PARAMS = { skill: 'skill', tab: 'tab', topic: 'topic', lesson: 'lesson', practice: 'practice', read: 'read' };

// The Learn page: a tab (with a topic chosen for a lesson or practice), or one guided
// lesson, practice set or resource to read.
export function build_learn_path({ skill_id, tab, topic_id, lesson_id, practice_id, resource_id }) {
  const query = new URLSearchParams();
  const values = { skill: skill_id, tab, topic: topic_id, lesson: lesson_id, practice: practice_id, read: resource_id };
  for (const [param_key, value] of Object.entries(values)) {
    if (value) query.set(LEARN_PARAMS[param_key], value);
  }
  const query_text = query.toString();
  return `${ROUTE_PATHS.dashboard}/learn${query_text ? `?${query_text}` : ''}`;
}
