import { add_days, DAYS_PER_WEEK } from './dates.js';

// Suggests study sessions for a week from the learning style quiz answers: how many hours a
// week the student has, when they like to study, and how long they can focus (their work
// block length). Skills with weak or untested topics get sessions first. Nothing is saved
// here; the student picks which suggestions to add.

// Minutes a week for each "How many hours a week can you study?" answer.
export const WEEKLY_STUDY_MINUTES = { under_2: 90, '2_to_5': 210, '5_to_10': 450, over_10: 600 };
// The start hour for each "When do you prefer to study?" answer.
export const STUDY_TIME_START_HOURS = { morning: 9, afternoon: 15, evening: 18, late_night: 21 };
export const DEFAULT_PLAN_PREFERENCES = { weekly_hours: '2_to_5', study_times: ['evening'] };
const MS_PER_MINUTE = 60 * 1000;
const PLANNED_SESSION_DETAILS = 'Planned from your learning style quiz answers.';

// The answers the planner uses, falling back to defaults for a skipped quiz.
export function get_plan_preferences(learning_profile) {
  return {
    weekly_hours: learning_profile?.weekly_hours ?? DEFAULT_PLAN_PREFERENCES.weekly_hours,
    study_times: learning_profile?.study_times?.length ? learning_profile.study_times : DEFAULT_PLAN_PREFERENCES.study_times,
  };
}

// Skills that need the most work first: weak topics count double, then untested topics,
// then the skill with more resources to study from.
export function rank_skills_for_planning(skills) {
  const need_score = (skill) => (skill.weak_topic_count ?? 0) * 2 + (skill.untested_topic_count ?? 0);
  return [...skills].sort(
    (first_skill, second_skill) =>
      need_score(second_skill) - need_score(first_skill) || (second_skill.resource_count ?? 0) - (first_skill.resource_count ?? 0),
  );
}

// True when the start-end time range overlaps any of the busy ranges ({ starts_at, ends_at }).
export function overlaps_any(starts_at, ends_at, busy_ranges) {
  return busy_ranges.some((busy_range) => starts_at < new Date(busy_range.ends_at) && ends_at > new Date(busy_range.starts_at));
}

// Possible session start times in the week, spread out: each day's first preferred time
// across the whole week comes before any day's second, so sessions land on different days.
export function list_candidate_starts(week_start, study_times) {
  const start_hours = study_times
    .map((study_time) => STUDY_TIME_START_HOURS[study_time])
    .filter(Number.isInteger)
    .sort((first_hour, second_hour) => first_hour - second_hour);
  const candidate_starts = [];
  start_hours.forEach((start_hour) => {
    for (let day_index = 0; day_index < DAYS_PER_WEEK; day_index += 1) {
      const candidate_start = add_days(week_start, day_index);
      candidate_start.setHours(start_hour, 0, 0, 0);
      candidate_starts.push(candidate_start);
    }
  });
  return candidate_starts;
}

// Returns suggested sessions [{ title, skill_id, skill_name, starts_at, ends_at, details }]
// for the week starting week_start: enough sessions of session_minutes to fill the weekly
// study time, at preferred times in the future that don't clash with existing events,
// handed out to skills in order of need.
export function plan_study_week({ week_start, now, learning_profile, skills, events, session_minutes }) {
  if (skills.length === 0) return [];
  const { weekly_hours, study_times } = get_plan_preferences(learning_profile);
  const session_count = Math.max(1, Math.round(WEEKLY_STUDY_MINUTES[weekly_hours] / session_minutes));
  const ranked_skills = rank_skills_for_planning(skills);
  const busy_ranges = [...events];
  const proposals = [];

  for (const candidate_start of list_candidate_starts(week_start, study_times)) {
    if (proposals.length === session_count) break;
    const candidate_end = new Date(candidate_start.getTime() + session_minutes * MS_PER_MINUTE);
    if (candidate_start <= now || overlaps_any(candidate_start, candidate_end, busy_ranges)) continue;

    const skill = ranked_skills[proposals.length % ranked_skills.length];
    const proposal = {
      title: `Study ${skill.name}`,
      skill_id: skill.id,
      skill_name: skill.name,
      starts_at: candidate_start.toISOString(),
      ends_at: candidate_end.toISOString(),
      details: PLANNED_SESSION_DETAILS,
    };
    proposals.push(proposal);
    busy_ranges.push(proposal);
  }
  return proposals.sort((first, second) => new Date(first.starts_at) - new Date(second.starts_at));
}
