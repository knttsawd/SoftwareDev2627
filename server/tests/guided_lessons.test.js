import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { create_app } from '../app.js';
import { IN_MEMORY_DATABASE, LESSON_STEP_COUNT, MAX_LESSON_RETEACHES } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { to_lesson_check } from '../services/ai/learning_outputs.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import {
  advance_guided_lesson,
  answer_lesson_check,
  can_reteach,
  count_first_try_correct,
  delete_guided_lesson,
  get_current_check,
  get_owned_guided_lesson,
  is_check_correct,
  list_guided_lessons,
  reteach_current_step,
  start_guided_lesson,
  to_guided_lesson,
  to_public_check,
} from '../services/guided_lesson_service.js';
import {
  validate_choice_index,
  validate_count,
  validate_lesson_input,
  validate_text,
} from '../services/learning_validators.js';
import { add_topic } from '../services/topic_service.js';
import { create_student_with_skill, insert_test_resource, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

const CHECK = { question: 'What absorbs light?', choices: ['Chlorophyll', 'Roots', 'Xylem', 'Stomata'], correct_index: 0, explanation: 'It does.' };

// A stored step with the given checks (each { chosen_index }).
function make_step(...chosen_indexes) {
  return {
    title: 'Light',
    explanation_markdown: 'Plants catch light.',
    example_markdown: 'A leaf.',
    checks: chosen_indexes.map((chosen_index) => ({ ...to_lesson_check(CHECK), chosen_index })),
  };
}

// The mock AI, with reteaching made predictable.
function create_lesson_ai() {
  return { ...create_mock_ai_provider(), reteach_lesson_step: vi.fn().mockResolvedValue({ reteach_markdown: 'Again.', check: CHECK }) };
}

// A student with a skill, a resource and a two-step lesson on Photosynthesis.
async function start_test_lesson(ai_provider = create_lesson_ai()) {
  const database = open_database(IN_MEMORY_DATABASE);
  const { user_id, skill } = await create_student_with_skill(database);
  insert_test_resource(database, { user_id, skill_id: skill.id });
  const lesson = await start_guided_lesson({
    database,
    ai_provider,
    user_id,
    skill,
    lesson_details: { topic: 'Photosynthesis', topic_id: null, step_count: 2 },
  });
  return { database, ai_provider, user_id, skill, lesson };
}

// The stored current check's correct answer, and a wrong one.
function read_answers(database, user_id, lesson_id) {
  const lesson_row = get_owned_guided_lesson(database, user_id, lesson_id);
  const check = get_current_check(JSON.parse(lesson_row.steps)[lesson_row.current_step]);
  return { lesson_row, right: check.correct_index, wrong: (check.correct_index + 1) % check.choices.length };
}

describe('lesson validators', () => {
  it('checks counts, text and choices', () => {
    expect(validate_count(undefined, LESSON_STEP_COUNT, 'steps')).toBeNull();
    expect(validate_count(9, LESSON_STEP_COUNT, 'steps')).toBe('Choose between 3 and 6 steps');
    expect(validate_count(2.5, LESSON_STEP_COUNT, 'steps')).toBe('Choose between 3 and 6 steps');
    expect(validate_text(' ', 10, 'Empty')).toBe('Empty');
    expect(validate_text('x'.repeat(11), 10, 'Empty')).toBe('Keep it under 10 characters');
    expect(validate_text('ok', 10, 'Empty')).toBeNull();
    expect(validate_choice_index(3)).toBeNull();
    expect(validate_choice_index(4)).toBe('Choose one of the answers');
    expect(validate_choice_index('1')).toBe('Choose one of the answers');
  });

  it('needs a topic, and fills in the default step count', () => {
    expect(validate_lesson_input({ topic: ' Cells ' })).toEqual({
      field_errors: {},
      values: { topic: 'Cells', topic_id: null, step_count: LESSON_STEP_COUNT.default },
    });
    expect(validate_lesson_input({ topic_id: 't1', step_count: 5 }).values).toMatchObject({ topic_id: 't1', step_count: 5 });
    expect(validate_lesson_input({ step_count: 99 }).field_errors).toEqual({
      topic: 'Topic is required',
      step_count: 'Choose between 3 and 6 steps',
    });
  });
});

describe('lesson steps and checks', () => {
  it('uses the latest check and knows when it was right', () => {
    const step = make_step(1, 0);
    expect(get_current_check(step).chosen_index).toBe(0);
    expect(is_check_correct(step.checks[0])).toBe(false);
    expect(is_check_correct(step.checks[1])).toBe(true);
  });

  it('hides the answer until the check is answered', () => {
    expect(to_public_check(make_step(null).checks[0])).toEqual({
      reteach_markdown: null,
      question: CHECK.question,
      choices: CHECK.choices,
      chosen_index: null,
    });
    expect(to_public_check(make_step(2).checks[0])).toMatchObject({ correct_index: 0, explanation: 'It does.', is_correct: false });
  });

  it('explains again only after a wrong answer, and only so many times', () => {
    expect(can_reteach(make_step(null))).toBe(false);
    expect(can_reteach(make_step(0))).toBe(false);
    expect(can_reteach(make_step(1))).toBe(true);
    expect(can_reteach(make_step(...Array(MAX_LESSON_RETEACHES + 1).fill(1)))).toBe(false);
    expect(count_first_try_correct([make_step(0), make_step(1, 0), make_step(0)])).toBe(2);
  });

  it('shows steps only up to the current one', () => {
    const lesson_row = {
      id: 'l1',
      skill_id: 's1',
      skill_node_id: null,
      topic: 'Light',
      steps: JSON.stringify([make_step(0), make_step(null), make_step(null)]),
      current_step: 1,
      completed_at: null,
      created_at: 'now',
    };
    const lesson = to_guided_lesson(lesson_row);
    expect(lesson).toMatchObject({ step_count: 3, current_step: 1, is_complete: false, can_reteach: false, first_try_correct: null });
    expect(lesson.steps).toHaveLength(2);
  });
});

describe('guided lessons', () => {
  it('starts on the first step, with answers hidden, linked to a map topic of the same name', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id, skill } = await create_student_with_skill(database);
    const map_topic = add_topic(database, user_id, skill.id, { topic: 'Photosynthesis' });
    insert_test_resource(database, { user_id, skill_id: skill.id });
    const ai_provider = create_lesson_ai();
    vi.spyOn(ai_provider, 'generate_lesson');

    const lesson = await start_guided_lesson({
      database,
      ai_provider,
      user_id,
      skill,
      lesson_details: { topic: 'photosynthesis', topic_id: null, step_count: 3 },
    });

    expect(lesson).toMatchObject({ topic_id: map_topic.id, current_step: 0, is_complete: false });
    expect(lesson.steps).toHaveLength(1);
    expect(lesson.steps[0].checks[0]).not.toHaveProperty('correct_index');
    expect(ai_provider.generate_lesson.mock.calls[0][0]).toMatchObject({ skill_name: 'Biology', step_count: 3 });
    expect(ai_provider.generate_lesson.mock.calls[0][0].source_text).toMatch('Photosynthesis');
    expect(list_guided_lessons(database, user_id, skill.id)).toEqual([
      expect.objectContaining({ id: lesson.id, topic: 'photosynthesis', current_step: 0, is_complete: false }),
    ]);
  });

  it('records one answer per check', async () => {
    const { database, user_id, lesson } = await start_test_lesson();
    const { lesson_row, right } = read_answers(database, user_id, lesson.id);

    const answered = answer_lesson_check({ database, user_id, lesson_row, choice_index: right });
    expect(answered.steps[0].checks[0]).toMatchObject({ chosen_index: right, is_correct: true });
    expect(answered.can_reteach).toBe(false);
    const answered_row = get_owned_guided_lesson(database, user_id, lesson.id);
    expect(() => answer_lesson_check({ database, user_id, lesson_row: answered_row, choice_index: right })).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it('explains a missed step again with a new check, up to the limit', async () => {
    const { database, ai_provider, user_id, skill, lesson } = await start_test_lesson();
    const { lesson_row, wrong } = read_answers(database, user_id, lesson.id);
    expect(() => advance_guided_lesson({ database, user_id, lesson_row })).toThrow(expect.objectContaining({ status: 409 }));
    await expect(reteach_current_step({ database, ai_provider, user_id, skill, lesson_row })).rejects.toMatchObject({ status: 409 });

    answer_lesson_check({ database, user_id, lesson_row, choice_index: wrong });
    for (let reteach_number = 1; reteach_number <= MAX_LESSON_RETEACHES; reteach_number += 1) {
      const missed_row = get_owned_guided_lesson(database, user_id, lesson.id);
      const retaught = await reteach_current_step({ database, ai_provider, user_id, skill, lesson_row: missed_row });
      expect(retaught.steps[0].checks.at(-1)).toMatchObject({ reteach_markdown: 'Again.', chosen_index: null });
      answer_lesson_check({ database, user_id, lesson_row: get_owned_guided_lesson(database, user_id, lesson.id), choice_index: 1 });
    }
    const missed_check = ai_provider.reteach_lesson_step.mock.calls[0][0].missed_check;
    expect(missed_check.correct_choice).not.toBe(missed_check.chosen_choice);

    const final_row = get_owned_guided_lesson(database, user_id, lesson.id);
    expect(to_guided_lesson(final_row).can_reteach).toBe(false);
    await expect(reteach_current_step({ database, ai_provider, user_id, skill, lesson_row: final_row })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('moves through the steps and completes after the last one', async () => {
    const { database, user_id, lesson } = await start_test_lesson();
    let current_lesson = lesson;
    for (let step_number = 0; step_number < lesson.step_count; step_number += 1) {
      const { lesson_row, right } = read_answers(database, user_id, lesson.id);
      answer_lesson_check({ database, user_id, lesson_row, choice_index: right });
      current_lesson = advance_guided_lesson({ database, user_id, lesson_row: get_owned_guided_lesson(database, user_id, lesson.id) });
    }

    expect(current_lesson).toMatchObject({ is_complete: true, first_try_correct: lesson.step_count });
    expect(current_lesson.steps).toHaveLength(lesson.step_count);
    const done_row = get_owned_guided_lesson(database, user_id, lesson.id);
    expect(() => advance_guided_lesson({ database, user_id, lesson_row: done_row })).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => answer_lesson_check({ database, user_id, lesson_row: done_row, choice_index: 0 })).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it('deletes only the student’s own lessons', async () => {
    const { database, user_id, lesson } = await start_test_lesson();
    expect(() => delete_guided_lesson(database, 'someone-else', lesson.id)).toThrow(expect.objectContaining({ status: 404 }));
    delete_guided_lesson(database, user_id, lesson.id);
    expect(() => get_owned_guided_lesson(database, user_id, lesson.id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('guided lesson routes', () => {
  it('runs a lesson from start to finish', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const ai_provider = create_lesson_ai();
    const app = create_app({ database, uploads_path: '.', client_origin: '', ai_provider, transcriber: null });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);
    const skill = (await as_student('post', '/api/skills').send({ name: 'Biology' })).body;
    await as_student('post', `/api/skills/${skill.id}/resources/text`).send({ title: 'Notes', text: SAMPLE_STUDY_TEXT });

    expect((await as_student('post', `/api/skills/${skill.id}/guided-lessons`).send({ step_count: 1 })).status).toBe(400);
    const started = await as_student('post', `/api/skills/${skill.id}/guided-lessons`).send({ topic: 'Photosynthesis', step_count: 3 });
    expect(started.status).toBe(201);
    const lesson_url = `/api/guided-lessons/${started.body.id}`;
    const user_id = database.prepare('SELECT id FROM users').get().id;

    expect((await as_student('post', `${lesson_url}/answer`).send({ choice_index: 9 })).status).toBe(400);
    const { wrong } = read_answers(database, user_id, started.body.id);
    expect((await as_student('post', `${lesson_url}/answer`).send({ choice_index: wrong })).body.can_reteach).toBe(true);
    const retaught = await as_student('post', `${lesson_url}/reteach`);
    expect(retaught.body.steps[0].checks).toHaveLength(2);
    await as_student('post', `${lesson_url}/answer`).send({ choice_index: 0 });
    expect((await as_student('post', `${lesson_url}/next`)).body.current_step).toBe(Math.min(1, started.body.step_count - 1));

    expect((await as_student('get', lesson_url)).body.id).toBe(started.body.id);
    expect((await as_student('get', `/api/skills/${skill.id}/guided-lessons`)).body).toHaveLength(1);
    expect((await as_student('delete', lesson_url)).status).toBe(204);
    expect((await as_student('get', lesson_url)).status).toBe(404);
  });
});
