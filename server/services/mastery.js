import { MASTERY_THRESHOLDS, MAX_STUDY_SUGGESTIONS } from '../config/constants.js';

export const MASTERY_LEVEL = { strong: 'strong', developing: 'developing', weak: 'weak', untested: 'untested' };

// Which topics to study first: weakest scores, then topics never quizzed, then ones that
// are nearly there. Strong topics are never suggested.
const SUGGESTION_ORDER = [MASTERY_LEVEL.weak, MASTERY_LEVEL.untested, MASTERY_LEVEL.developing];

// 0-100 score (or null for "never quizzed") -> one of MASTERY_LEVEL.
export function get_mastery_level(mastery_score) {
  if (mastery_score === null || mastery_score === undefined) return MASTERY_LEVEL.untested;
  if (mastery_score >= MASTERY_THRESHOLDS.strong) return MASTERY_LEVEL.strong;
  if (mastery_score >= MASTERY_THRESHOLDS.developing) return MASTERY_LEVEL.developing;
  return MASTERY_LEVEL.weak;
}

// The average of recent quiz scores, rounded to a whole percent, or null with no scores.
export function average_score(scores) {
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
}

// A topic's standing in a few words for the assistant's prompt: "weak, 33%" or "not quizzed yet".
export function describe_mastery_for_chat(topic) {
  if (topic.mastery_level === MASTERY_LEVEL.untested) return 'not quizzed yet';
  return `${topic.mastery_level}, ${topic.mastery_score}%`;
}

// One sentence telling the student why a topic is suggested.
export function describe_suggestion_reason(topic) {
  if (topic.mastery_level === MASTERY_LEVEL.weak) {
    return `Your recent score is ${topic.mastery_score}%. Review your notes, then try another quiz.`;
  }
  if (topic.mastery_level === MASTERY_LEVEL.untested) return "You haven't been quizzed on this yet.";
  return `You're at ${topic.mastery_score}%. A little more practice will make it stick.`;
}

// Picks up to MAX_STUDY_SUGGESTIONS topics to study next, each as { topic_id, topic,
// mastery_level, reason }. Within a level, lower scores come first; untested topics keep
// the map's order.
export function rank_study_suggestions(topics) {
  return topics
    .filter((topic) => SUGGESTION_ORDER.includes(topic.mastery_level))
    .map((topic, map_order) => ({ topic, map_order }))
    .sort(
      (first, second) =>
        SUGGESTION_ORDER.indexOf(first.topic.mastery_level) - SUGGESTION_ORDER.indexOf(second.topic.mastery_level) ||
        (first.topic.mastery_score ?? 0) - (second.topic.mastery_score ?? 0) ||
        first.map_order - second.map_order,
    )
    .slice(0, MAX_STUDY_SUGGESTIONS)
    .map(({ topic }) => ({
      topic_id: topic.id,
      topic: topic.topic,
      mastery_level: topic.mastery_level,
      reason: describe_suggestion_reason(topic),
    }));
}
