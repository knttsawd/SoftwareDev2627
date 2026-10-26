import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { create_app } from '../app.js';
import { IN_MEMORY_DATABASE, PRACTICE_PROBLEM_COUNT } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import { start_guided_lesson } from '../services/guided_lesson_service.js';
import {
  assign_path_statuses,
  build_learning_path,
  get_learning_path,
  list_path_topics,
  summarize_topic_lessons,
} from '../services/learning_path_service.js';
import { validate_practice_answer, validate_practice_input } from '../services/learning_validators.js';
import {
  check_practice_answer,
  create_practice_set,
  delete_practice_set,
  find_problem,
  get_owned_practice_set,
  is_problem_solved,
  list_practice_sets,
  reveal_hint,
  reveal_solution,
  to_public_problem,
} from '../services/practice_service.js';
import { add_topic, delete_topic } from '../services/topic_service.js';
import { create_student_with_skill, insert_test_resource, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

// A stored practice problem with the given progress.
function make_problem(overrides = {}) {
  return {
    problem: '2x = 4',
    hints: ['Divide.', 'By 2.', 'Nearly.'],
    solution_steps: ['4 / 2 = 2'],
    answer: '2',
    hints_shown: 0,
    is_solution_shown: false,
    attempts: [],
    ...overrides,
  };
}

describe('learning path topics', () => {
  const topics = [
    { id: 'unit', parent_node_id: null, topic: 'Photosynthesis', summary: 'Unit.', mastery_level: 'untested' },
    { id: 'light', parent_node_id: 'unit', topic: 'Light reactions', summary: null, mastery_level: 'strong' },
    { id: 'cells', parent_node_id: null, topic: 'Cells', summary: 'Small.', mastery_level: 'weak' },
    { id: 'calvin', parent_node_id: 'unit', topic: 'Calvin cycle', summary: 'Sugar.', mastery_level: 'untested' },
    { id: 'orphan', parent_node_id: 'deleted', topic: 'Orphan', summary: '', mastery_level: 'untested' },
  ];

  it('lists only the topics without subtopics, in map order, with their parent', () => {
    expect(list_path_topics(topics)).toEqual([
      { id: 'light', topic: 'Light reactions', summary: '', parent_topic: 'Photosynthesis', mastery_level: 'strong' },
      { id: 'calvin', topic: 'Calvin cycle', summary: 'Sugar.', parent_topic: 'Photosynthesis', mastery_level: 'untested' },
      { id: 'cells', topic: 'Cells', summary: 'Small.', parent_topic: '', mastery_level: 'weak' },
      { id: 'orphan', topic: 'Orphan', summary: '', parent_topic: '', mastery_level: 'untested' },
    ]);
  });

  it('remembers the latest lesson per topic and whether any was finished', () => {
    const summaries = summarize_topic_lessons([
      { id: 'l1', topic_id: 't1', is_complete: true },
      { id: 'l2', topic_id: 't1', is_complete: false },
      { id: 'l3', topic_id: 't2', is_complete: false },
    ]);
    expect(summaries.get('t1')).toEqual({ latest_lesson_id: 'l2', is_latest_complete: false, has_finished: true });
    expect(summaries.get('t2')).toEqual({ latest_lesson_id: 'l3', is_latest_complete: false, has_finished: false });
  });

  it('marks finished or strong steps done, then one next and the rest to do', () => {
    const statuses = assign_path_statuses([
      { mastery_level: 'strong', lesson: null },
      { mastery_level: 'weak', lesson: null },
      { mastery_level: 'untested', lesson: { has_finished: true } },
      { mastery_level: 'untested', lesson: null },
    ]).map((path_step) => path_step.status);
    expect(statuses).toEqual(['done', 'next', 'done', 'todo']);
  });
});

describe('learning paths', () => {
  it('finds topics for a skill with none, then saves the AI order', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id, skill } = await create_student_with_skill(database);
    insert_test_resource(database, { user_id, skill_id: skill.id });
    const ai_provider = create_mock_ai_provider();
    vi.spyOn(ai_provider, 'generate_topics');

    expect(get_learning_path(database, user_id, skill)).toEqual({ has_path: false, created_at: null, steps: [], new_topic_count: 0, topic_count: 0 });
    const path = await build_learning_path({ database, ai_provider, user_id, skill });

    expect(ai_provider.generate_topics).toHaveBeenCalledOnce();
    expect(path.has_path).toBe(true);
    expect(path.steps.length).toBe(path.topic_count);
    expect(path.steps[0]).toMatchObject({ status: 'next', is_new: false, lesson: null });
  });

  it('follows the saved order, drops deleted topics and adds new ones at the end', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id, skill } = await create_student_with_skill(database);
    const first = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    const second = add_topic(database, user_id, skill.id, { topic: 'Energy' });
    const third = add_topic(database, user_id, skill.id, { topic: 'Genes' });
    const ai_provider = {
      ...create_mock_ai_provider(),
      order_learning_path: vi.fn().mockResolvedValue({
        steps: [
          { index: 2, reason: 'Basics' },
          { index: 0, reason: 'Then' },
          { index: 1, reason: '' },
        ],
      }),
    };
    await build_learning_path({ database, ai_provider, user_id, skill });
    delete_topic(database, user_id, first.id);
    const added = add_topic(database, user_id, skill.id, { topic: 'Ecology' });

    const path = get_learning_path(database, user_id, skill);
    expect(path.steps.map((path_step) => [path_step.topic_id, path_step.reason, path_step.is_new])).toEqual([
      [third.id, 'Basics', false],
      [second.id, '', false],
      [added.id, '', true],
    ]);
    expect(path.new_topic_count).toBe(1);
  });

  it('shows each step’s latest guided lesson and counts finished ones as done', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id, skill } = await create_student_with_skill(database);
    insert_test_resource(database, { user_id, skill_id: skill.id });
    const topic = add_topic(database, user_id, skill.id, { topic: 'Photosynthesis' });
    const ai_provider = create_mock_ai_provider();
    await build_learning_path({ database, ai_provider, user_id, skill });
    const lesson = await start_guided_lesson({
      database,
      ai_provider,
      user_id,
      skill,
      lesson_details: { topic: null, topic_id: topic.id, step_count: 3 },
    });

    expect(get_learning_path(database, user_id, skill).steps[0]).toMatchObject({
      status: 'next',
      lesson: { latest_lesson_id: lesson.id, is_latest_complete: false, has_finished: false },
    });
    database.prepare("UPDATE guided_lessons SET completed_at = 'done'").run();
    expect(get_learning_path(database, user_id, skill).steps[0].status).toBe('done');
  });
});

describe('practice validators and problems', () => {
  it('needs a topic and a typed answer', () => {
    expect(validate_practice_input({ topic: 'Cells' }).values.problem_count).toBe(PRACTICE_PROBLEM_COUNT.default);
    expect(validate_practice_input({ topic: 'Cells', problem_count: 0 }).field_errors.problem_count).toBe('Choose between 1 and 5 problems');
    expect(validate_practice_answer(' ')).toBe('Type an answer first');
    expect(validate_practice_answer('2')).toBeNull();
  });

  it('shows only the hints asked for, and the solution only when asked', () => {
    expect(to_public_problem(make_problem({ hints_shown: 1 }))).toEqual({
      problem: '2x = 4',
      hints: ['Divide.'],
      hint_count: 3,
      attempts: [],
      is_solved: false,
      is_solution_shown: false,
      solution_steps: null,
      answer: null,
    });
    expect(to_public_problem(make_problem({ is_solution_shown: true }))).toMatchObject({ solution_steps: ['4 / 2 = 2'], answer: '2' });
    expect(is_problem_solved(make_problem({ attempts: [{ is_correct: false }, { is_correct: true }] }))).toBe(true);
  });

  it('finds a problem by position, or answers 404', () => {
    const practice_row = { problems: JSON.stringify([make_problem()]) };
    expect(find_problem(practice_row, 0).practice_problem.problem).toBe('2x = 4');
    expect(() => find_problem(practice_row, 1)).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => find_problem(practice_row, Number.NaN)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('practice sets', () => {
  async function create_test_practice_set() {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id, skill } = await create_student_with_skill(database);
    insert_test_resource(database, { user_id, skill_id: skill.id });
    const ai_provider = create_mock_ai_provider();
    const practice_set = await create_practice_set({
      database,
      ai_provider,
      user_id,
      skill,
      practice_details: { topic: 'Photosynthesis', topic_id: null, problem_count: 2 },
    });
    const practice_row = () => get_owned_practice_set(database, user_id, practice_set.id);
    return { database, ai_provider, user_id, skill, practice_set, practice_row };
  }

  it('starts with a worked example and no hints shown', async () => {
    const { database, user_id, skill, practice_set } = await create_test_practice_set();
    expect(practice_set.worked_example.steps.length).toBeGreaterThan(0);
    expect(practice_set.problems[0]).toMatchObject({ hints: [], hint_count: 3, answer: null, is_solved: false });
    expect(list_practice_sets(database, user_id, skill.id)).toEqual([
      expect.objectContaining({ id: practice_set.id, topic: 'Photosynthesis', problem_count: practice_set.problems.length, solved_count: 0 }),
    ]);
  });

  it('reveals hints one at a time, then refuses more', async () => {
    const { database, user_id, practice_row } = await create_test_practice_set();
    for (let hint_number = 1; hint_number <= 3; hint_number += 1) {
      expect(reveal_hint({ database, user_id, practice_row: practice_row(), problem_index: 0 }).problems[0].hints).toHaveLength(hint_number);
    }
    expect(() => reveal_hint({ database, user_id, practice_row: practice_row(), problem_index: 0 })).toThrow(
      expect.objectContaining({ status: 409 }),
    );
    expect(reveal_solution({ database, user_id, practice_row: practice_row(), problem_index: 0 }).problems[0].answer).toBeTruthy();
  });

  it('checks answers, keeps each attempt, and stops once solved', async () => {
    const { database, ai_provider, user_id, practice_row } = await create_test_practice_set();
    const answer = JSON.parse(practice_row().problems)[0].answer;

    const wrong = await check_practice_answer({ database, ai_provider, user_id, practice_row: practice_row(), problem_index: 0, answer: 'nope' });
    expect(wrong.attempt.is_correct).toBe(false);
    const right = await check_practice_answer({ database, ai_provider, user_id, practice_row: practice_row(), problem_index: 0, answer });
    expect(right.practice_set.problems[0]).toMatchObject({ is_solved: true, attempts: [wrong.attempt, right.attempt] });
    expect(right.practice_set.solved_count).toBe(1);
    await expect(
      check_practice_answer({ database, ai_provider, user_id, practice_row: practice_row(), problem_index: 0, answer }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('deletes only the student’s own practice sets', async () => {
    const { database, user_id, practice_set } = await create_test_practice_set();
    expect(() => delete_practice_set(database, 'someone-else', practice_set.id)).toThrow(expect.objectContaining({ status: 404 }));
    delete_practice_set(database, user_id, practice_set.id);
    expect(() => get_owned_practice_set(database, user_id, practice_set.id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('learning path and practice routes', () => {
  it('builds a path and works through a practice set', async () => {
    const app = create_app({
      database: open_database(IN_MEMORY_DATABASE),
      uploads_path: '.',
      client_origin: '',
      ai_provider: create_mock_ai_provider(),
      transcriber: null,
    });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);
    const skill = (await as_student('post', '/api/skills').send({ name: 'Biology' })).body;
    await as_student('post', `/api/skills/${skill.id}/resources/text`).send({ title: 'Notes', text: SAMPLE_STUDY_TEXT });

    expect((await as_student('get', `/api/skills/${skill.id}/learning-path`)).body.has_path).toBe(false);
    expect((await as_student('post', `/api/skills/${skill.id}/learning-path`)).body.has_path).toBe(true);

    expect((await as_student('post', `/api/skills/${skill.id}/practice-sets`).send({})).status).toBe(400);
    const created = await as_student('post', `/api/skills/${skill.id}/practice-sets`).send({ topic: 'Photosynthesis', problem_count: 1 });
    expect(created.status).toBe(201);
    const practice_url = `/api/practice-sets/${created.body.id}`;
    expect((await as_student('post', `${practice_url}/problems/0/hint`)).body.problems[0].hints).toHaveLength(1);
    expect((await as_student('post', `${practice_url}/problems/5/hint`)).status).toBe(404);
    expect((await as_student('post', `${practice_url}/problems/0/check`).send({ answer: '' })).status).toBe(400);
    expect((await as_student('post', `${practice_url}/problems/0/check`).send({ answer: 'wrong' })).body.attempt.is_correct).toBe(false);
    expect((await as_student('post', `${practice_url}/problems/0/solution`)).body.problems[0].is_solution_shown).toBe(true);
    expect((await as_student('get', practice_url)).body.id).toBe(created.body.id);
    expect((await as_student('get', `/api/skills/${skill.id}/practice-sets`)).body).toHaveLength(1);
    expect((await as_student('delete', practice_url)).status).toBe(204);
  });
});
