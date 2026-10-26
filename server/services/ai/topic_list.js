import { HTTP_STATUS, TOPIC_MAX_LENGTH, TOPIC_SUMMARY_MAX_LENGTH } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';

// Cleans up the topic list an AI returned: trims names and summaries, drops empty, too
// long and repeated topics (ignoring letter case), clears a parent that names the topic
// itself, and keeps at most max_topics. Throws a 502 if nothing usable is left.
export function normalize_topic_list(raw_topics, max_topics) {
  const seen_names = new Set();
  const usable_topics = [];
  for (const raw_topic of Array.isArray(raw_topics) ? raw_topics : []) {
    const topic = typeof raw_topic?.topic === 'string' ? raw_topic.topic.trim() : '';
    if (!topic || topic.length > TOPIC_MAX_LENGTH || seen_names.has(topic.toLowerCase())) continue;
    seen_names.add(topic.toLowerCase());

    const parent_topic = typeof raw_topic.parent_topic === 'string' ? raw_topic.parent_topic.trim() : '';
    usable_topics.push({
      topic,
      summary: typeof raw_topic.summary === 'string' ? raw_topic.summary.trim().slice(0, TOPIC_SUMMARY_MAX_LENGTH) : '',
      parent_topic: parent_topic.toLowerCase() === topic.toLowerCase() ? '' : parent_topic,
    });
  }

  if (usable_topics.length === 0) {
    throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI did not find any topics. Please try again.');
  }
  return usable_topics.slice(0, max_topics);
}
