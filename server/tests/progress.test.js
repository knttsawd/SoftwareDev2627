import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { create_app } from '../app.js';
import { IN_MEMORY_DATABASE, MS_PER_DAY } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { average_score } from '../services/mastery.js';
import {
  build_skill_progress,
  compare_periods,
  find_topic_changes,
  get_progress,
  pick_topic_changes,
  split_by_period,
  sum_values,
  to_percent,
} from '../services/progress_service.js';
import { add_topic } from '../services/topic_service.js';
import { create_spied_ai, create_student_with_skill } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

const NOW = new Date('2026-10-24T12:00:00.000Z');

// An ISO time days_ago days before NOW.
function days_ago(day_count) {
  return new Date(NOW.getTime() - day_count * MS_PER_DAY).toISOString();
}

describe('period comparisons', () => {
  const dated_scores = [
    { at: days_ago(1), value: 80 },
    { at: days_ago(10), value: 60 },
    { at: days_ago(40), value: 40 },
    { at: days_ago(90), value: 0 },
  ];

  it('splits values into the recent period and the one before it, ignoring older ones', () => {
    expect(split_by_period(dated_scores, NOW, 30)).toEqual({ recent: [80, 60], previous: [40] });
  });

  it('compares averages or totals between the periods', () => {
    expect(compare_periods(dated_scores, NOW, 30, average_score)).toEqual({ recent: 70, previous: 40, change: 30, period_days: 30 });
    expect(compare_periods(dated_scores, NOW, 7, sum_values)).toEqual({ recent: 80, previous: 60, change: 20, period_days: 7 });
    expect(compare_periods([], NOW, 30, average_score)).toEqual({ recent: null, previous: null, change: null, period_days: 30 });
  });

  it('adds up values and turns shares into whole percents', () => {
    expect(sum_values([])).toBe(0);
    expect(sum_values([5, 10])).toBe(15);
    expect(to_percent(1, 3)).toBe(33);
    expect(to_percent(0, 0)).toBe(0);
  });
});

describe('topic changes', () => {
  const result_rows = [
    { topic_id: 't1', topic: 'Cells', skill_name: 'Biology', score: 40 },
    { topic_id: 't2', topic: 'Atoms', skill_name: 'Chemistry', score: 90 },
    { topic_id: 't1', topic: 'Cells', skill_name: 'Biology', score: 60 },
    { topic_id: 't2', topic: 'Atoms', skill_name: 'Chemistry', score: 70 },
    { topic_id: 't1', topic: 'Cells', skill_name: 'Biology', score: 100 },
    { topic_id: 't3', topic: 'Once', skill_name: 'Biology', score: 50 },
  ];

  it("compares each topic's first and latest score, for topics quizzed twice or more", () => {
    expect(find_topic_changes(result_rows)).toEqual([
      { topic_id: 't1', topic: 'Cells', skill_name: 'Biology', first_score: 40, latest_score: 100, change: 60, quiz_count: 3 },
      { topic_id: 't2', topic: 'Atoms', skill_name: 'Chemistry', first_score: 90, latest_score: 70, change: -20, quiz_count: 2 },
    ]);
  });

  it('picks the biggest improvements and slips', () => {
    const changes = [{ change: 10 }, { change: 30 }, { change: -5 }, { change: 0 }, { change: -40 }];

    expect(pick_topic_changes(changes, 1)).toEqual({ improved: [{ change: 30 }], slipping: [{ change: -40 }] });
  });
});

describe('build_skill_progress', () => {
  it('measures how much of a skill is quizzed and strong', () => {
    const skill = { id: 's1', name: 'Biology', color: '#000000', resource_count: 2 };

    expect(build_skill_progress(skill, [90, 60, 20, null])).toEqual({
      skill_id: 's1',
      name: 'Biology',
      color: '#000000',
      topic_count: 4,
      resource_count: 2,
      level_counts: { strong: 1, developing: 1, weak: 1, untested: 1 },
      quizzed_percent: 75,
      strong_percent: 25,
      average_mastery: 57,
    });
    expect(build_skill_progress(skill, [])).toMatchObject({ topic_count: 0, quizzed_percent: 0, average_mastery: null });
  });
});

describe('get_progress', () => {
  let database;
  let user_id;
  let skill;

  beforeEach(async () => {
    database = open_database(IN_MEMORY_DATABASE);
    ({ user_id, skill } = await create_student_with_skill(database));
  });

  // Saves a graded student quiz on a topic, completed at completed_at.
  function add_result(topic_id, score, completed_at) {
    const quiz_id = `q-${Math.random()}`;
    database
      .prepare("INSERT INTO quizzes (id, user_id, skill_id, skill_node_id, topic, questions) VALUES (?, ?, ?, ?, 'T', '[]')")
      .run(quiz_id, user_id, skill.id, topic_id);
    database
      .prepare(
        "INSERT INTO quiz_results (id, user_id, quiz_id, taker, answers, correct_count, total_count, score, completed_at) VALUES (?, ?, ?, 'student', '[]', 0, 1, ?, ?)",
      )
      .run(`r-${Math.random()}`, user_id, quiz_id, score, completed_at);
  }

  it('is empty but complete for a new student', () => {
    const progress = get_progress(database, user_id, NOW);

    expect(progress.skills).toHaveLength(1);
    expect(progress.quiz_scores.recent).toBeNull();
    expect(progress.study_minutes).toMatchObject({ recent: 0, previous: 0, change: 0 });
    expect(progress.topic_changes).toEqual({ improved: [], slipping: [] });
    expect(progress.teaching.lessons_done).toBe(0);
    expect(progress.totals).toEqual({ quizzes_taken: 0, topics_total: 0, topics_strong: 0 });
  });

  it('brings the skills, scores, study time, topic changes and teaching together', () => {
    const cells = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    database.prepare('UPDATE skill_nodes SET mastery_score = 90 WHERE id = ?').run(cells.id);
    add_result(cells.id, 40, days_ago(40));
    add_result(cells.id, 90, days_ago(2));
    database
      .prepare("INSERT INTO work_blocks (id, user_id, activity, planned_minutes, completed_minutes, started_at) VALUES ('w1', ?, 'quiz', 25, 25, ?)")
      .run(user_id, days_ago(1));
    database
      .prepare("INSERT INTO work_blocks (id, user_id, activity, planned_minutes, completed_minutes, started_at) VALUES ('w2', ?, 'quiz', 25, 10, ?)")
      .run(user_id, days_ago(9));
    database
      .prepare("INSERT INTO teach_sessions (id, user_id, skill_id, topic, combined_score, created_at) VALUES ('l1', ?, ?, 'Cells', 70, ?)")
      .run(user_id, skill.id, days_ago(3));

    const progress = get_progress(database, user_id, NOW);

    expect(progress.skills[0]).toMatchObject({ topic_count: 1, strong_percent: 100 });
    expect(progress.quiz_scores).toMatchObject({ recent: 90, previous: 40, change: 50 });
    expect(progress.study_minutes).toMatchObject({ recent: 25, previous: 10, change: 15 });
    expect(progress.recent_work_blocks).toHaveLength(2);
    expect(progress.topic_changes.improved).toEqual([expect.objectContaining({ topic: 'Cells', first_score: 40, latest_score: 90 })]);
    expect(progress.teaching).toEqual({ lessons_done: 1, grades: expect.objectContaining({ recent: 70 }) });
    expect(progress.totals).toEqual({ quizzes_taken: 2, topics_total: 1, topics_strong: 1 });
  });

  it('is served at /api/progress', async () => {
    const { ai_provider, transcriber } = create_spied_ai();
    const app = create_app({ database: open_database(IN_MEMORY_DATABASE), uploads_path: '.', client_origin: '', ai_provider, transcriber });
    const token = (await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token;

    const response = await request(app).get('/api/progress').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('totals');
    expect((await request(app).get('/api/progress')).status).toBe(401);
  });
});
