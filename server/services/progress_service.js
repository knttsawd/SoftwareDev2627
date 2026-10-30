import {
  MASTERY_THRESHOLDS,
  MAX_TOPIC_CHANGES,
  MS_PER_DAY,
  QUIZ_SCORE_PERIOD_DAYS,
  STUDY_TIME_CHART_DAYS,
  STUDY_TIME_PERIOD_DAYS,
} from '../config/constants.js';
import { average_score, get_mastery_level, MASTERY_LEVEL } from './mastery.js';
import { list_skills } from './skill_service.js';

// Progress tracking for the Progress page. On purpose there are only progress bars and
// improvement metrics: how far along each skill is, and how this period compares with the
// one before. No streaks, badges or levels.

const PERCENT = 100;

export function sum_values(values) {
  return values.reduce((total, value) => total + value, 0);
}

// Splits dated values ([{ at: ISO time, value }]) into the last period_days before now
// ("recent") and the period_days before that ("previous").
export function split_by_period(dated_values, now, period_days) {
  const recent_start = now.getTime() - period_days * MS_PER_DAY;
  const previous_start = recent_start - period_days * MS_PER_DAY;
  const recent = [];
  const previous = [];
  for (const { at, value } of dated_values) {
    const time = new Date(at).getTime();
    if (time > recent_start && time <= now.getTime()) recent.push(value);
    else if (time > previous_start && time <= recent_start) previous.push(value);
  }
  return { recent, previous };
}

// One improvement metric: combine (an average or a total) over the recent and previous
// periods, and the change between them (null unless both periods have a value).
export function compare_periods(dated_values, now, period_days, combine) {
  const { recent, previous } = split_by_period(dated_values, now, period_days);
  const recent_value = combine(recent);
  const previous_value = combine(previous);
  const change = recent_value === null || previous_value === null ? null : recent_value - previous_value;
  return { recent: recent_value, previous: previous_value, change, period_days };
}

// Each topic's first and latest quiz score, for topics quizzed at least twice.
// result_rows are { topic_id, topic, skill_name, score }, oldest first.
export function find_topic_changes(result_rows) {
  const results_by_topic = new Map();
  for (const result_row of result_rows) {
    results_by_topic.set(result_row.topic_id, [...(results_by_topic.get(result_row.topic_id) ?? []), result_row]);
  }
  return [...results_by_topic.values()]
    .filter((topic_results) => topic_results.length >= 2)
    .map((topic_results) => {
      const first_result = topic_results[0];
      const latest_result = topic_results.at(-1);
      return {
        topic_id: first_result.topic_id,
        topic: first_result.topic,
        skill_name: first_result.skill_name,
        first_score: first_result.score,
        latest_score: latest_result.score,
        change: latest_result.score - first_result.score,
        quiz_count: topic_results.length,
      };
    });
}

// The topics that improved most and those that slipped most, up to max_count of each.
export function pick_topic_changes(topic_changes, max_count = MAX_TOPIC_CHANGES) {
  return {
    improved: topic_changes
      .filter((topic_change) => topic_change.change > 0)
      .sort((first, second) => second.change - first.change)
      .slice(0, max_count),
    slipping: topic_changes
      .filter((topic_change) => topic_change.change < 0)
      .sort((first, second) => first.change - second.change)
      .slice(0, max_count),
  };
}

// A share as a whole percent, 0 when there is nothing to share.
export function to_percent(part, whole) {
  return whole === 0 ? 0 : Math.round((part / whole) * PERCENT);
}

// How far along one skill is, from its topics' mastery scores:
// { skill_id, name, color, topic_count, resource_count, level_counts, quizzed_percent,
//   strong_percent, average_mastery }.
export function build_skill_progress(skill, mastery_scores) {
  const level_counts = Object.fromEntries(Object.values(MASTERY_LEVEL).map((level) => [level, 0]));
  for (const mastery_score of mastery_scores) level_counts[get_mastery_level(mastery_score)] += 1;
  const tested_scores = mastery_scores.filter((mastery_score) => mastery_score !== null);
  return {
    skill_id: skill.id,
    name: skill.name,
    color: skill.color,
    topic_count: mastery_scores.length,
    resource_count: skill.resource_count,
    level_counts,
    quizzed_percent: to_percent(tested_scores.length, mastery_scores.length),
    strong_percent: to_percent(level_counts[MASTERY_LEVEL.strong], mastery_scores.length),
    average_mastery: average_score(tested_scores),
  };
}

// Everything the Progress page shows, worked out at now:
//   skills          progress bars for each skill (build_skill_progress)
//   quiz_scores     average quiz score, last QUIZ_SCORE_PERIOD_DAYS vs the period before
//   study_minutes   focus time from work blocks, last STUDY_TIME_PERIOD_DAYS vs the week before
//   recent_work_blocks  [{ started_at, completed_minutes }] for a daily chart (the client
//                   groups them into days in the student's own time zone)
//   topic_changes   { improved, slipping } from first to latest quiz score
//   teaching        { lessons_done, grades: average teaching grade, recent vs previous }
//   totals          { quizzes_taken, topics_total, topics_strong }
export function get_progress(database, user_id, now = new Date()) {
  const mastery_rows = database.prepare('SELECT skill_id, mastery_score FROM skill_nodes WHERE user_id = ?').all(user_id);
  const skills = list_skills(database, user_id).map((skill) =>
    build_skill_progress(
      skill,
      mastery_rows.filter((mastery_row) => mastery_row.skill_id === skill.id).map((mastery_row) => mastery_row.mastery_score),
    ),
  );

  const student_results = database
    .prepare(
      `SELECT quiz_results.score, quiz_results.completed_at, quizzes.skill_node_id AS topic_id,
              skill_nodes.topic, skills.name AS skill_name
       FROM quiz_results
       JOIN quizzes ON quizzes.id = quiz_results.quiz_id
       JOIN skills ON skills.id = quizzes.skill_id
       LEFT JOIN skill_nodes ON skill_nodes.id = quizzes.skill_node_id
       WHERE quiz_results.user_id = ? AND quiz_results.taker = 'student'
       ORDER BY quiz_results.completed_at, quiz_results.rowid`,
    )
    .all(user_id);
  const work_blocks = database
    .prepare('SELECT started_at, completed_minutes FROM work_blocks WHERE user_id = ? AND completed_minutes > 0 ORDER BY started_at')
    .all(user_id);
  const lesson_rows = database
    .prepare('SELECT created_at, combined_score FROM teach_sessions WHERE user_id = ? AND combined_score IS NOT NULL')
    .all(user_id);
  const chart_start = now.getTime() - STUDY_TIME_CHART_DAYS * MS_PER_DAY;

  return {
    skills,
    quiz_scores: compare_periods(
      student_results.map((result_row) => ({ at: result_row.completed_at, value: result_row.score })),
      now,
      QUIZ_SCORE_PERIOD_DAYS,
      average_score,
    ),
    study_minutes: compare_periods(
      work_blocks.map((work_block) => ({ at: work_block.started_at, value: work_block.completed_minutes })),
      now,
      STUDY_TIME_PERIOD_DAYS,
      sum_values,
    ),
    recent_work_blocks: work_blocks.filter((work_block) => new Date(work_block.started_at).getTime() > chart_start),
    topic_changes: pick_topic_changes(find_topic_changes(student_results.filter((result_row) => result_row.topic_id))),
    teaching: {
      lessons_done: lesson_rows.length,
      grades: compare_periods(
        lesson_rows.map((lesson_row) => ({ at: lesson_row.created_at, value: lesson_row.combined_score })),
        now,
        QUIZ_SCORE_PERIOD_DAYS,
        average_score,
      ),
    },
    totals: {
      quizzes_taken: student_results.length,
      topics_total: mastery_rows.length,
      topics_strong: mastery_rows.filter((mastery_row) => mastery_row.mastery_score >= MASTERY_THRESHOLDS.strong).length,
    },
  };
}
