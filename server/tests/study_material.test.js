import { beforeEach, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, QUIZ_QUESTION_COUNT } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { get_learning_style, save_learning_profile } from '../services/learning_profile_service.js';
import { create_study_notes, delete_note, list_notes } from '../services/note_service.js';
import {
  create_practice_quiz,
  delete_quiz,
  get_owned_quiz,
  list_quizzes,
  to_public_quiz,
} from '../services/quiz_service.js';
import {
  validate_notes_input,
  validate_question_count,
  validate_quiz_input,
  validate_topic,
} from '../services/study_validators.js';
import { VALID_LEARNING_ANSWERS } from './helpers/learning_answers.js';
import { create_spied_ai, create_student_with_skill, insert_test_resource } from './helpers/study_fixtures.js';

let database;
let user_id;
let skill;
let ai_provider;

beforeEach(async () => {
  database = open_database(IN_MEMORY_DATABASE);
  ({ user_id, skill } = await create_student_with_skill(database));
  insert_test_resource(database, { user_id, skill_id: skill.id });
  ({ ai_provider } = create_spied_ai());
});

describe('study validators', () => {
  it('check topics', () => {
    expect(validate_topic('Photosynthesis')).toBeNull();
    expect(validate_topic(' ')).toBe('Topic is required');
    expect(validate_topic('x'.repeat(121))).toMatch('at most 120');
    expect(validate_notes_input({ topic: ' Cells ' })).toEqual({ field_errors: {}, values: { topic: 'Cells' } });
  });

  it('allow a missing question count and check sent ones', () => {
    expect(validate_question_count(undefined)).toBeNull();
    expect(validate_question_count(5)).toBeNull();
    expect(validate_question_count(2)).toBe('Choose between 3 and 15 questions');
    expect(validate_question_count(4.5)).toBe('Choose between 3 and 15 questions');
  });

  it('fill in the default question count', () => {
    expect(validate_quiz_input({ topic: 'Cells' }).values).toEqual({
      scope: 'topic',
      topic: 'Cells',
      topic_id: null,
      resource_id: null,
      question_count: QUIZ_QUESTION_COUNT.default,
    });
    expect(validate_quiz_input({ topic: '', question_count: 99 }).field_errors).toEqual({
      topic: 'Topic is required',
      question_count: 'Choose between 3 and 15 questions',
    });
  });
});

describe('get_learning_style', () => {
  it('reads the learning style, or null when the quiz was skipped', () => {
    expect(get_learning_style(database, user_id)).toBeNull();

    save_learning_profile(database, user_id, VALID_LEARNING_ANSWERS);

    expect(get_learning_style(database, user_id)).toBe('visual');
  });
});

describe('notes', () => {
  it('generates notes from the skill resources with the learning style, and saves them', async () => {
    save_learning_profile(database, user_id, VALID_LEARNING_ANSWERS);

    const note = await create_study_notes({ database, ai_provider, user_id, skill_id: skill.id, topic: 'Photosynthesis' });

    expect(ai_provider.generate_notes).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Photosynthesis', learning_style: 'visual', source_text: expect.stringContaining('[From: Chapter 1]') }),
    );
    expect(note).toMatchObject({ skill_id: skill.id, topic: 'Photosynthesis' });
    expect(note.content).toMatch(/^# Photosynthesis/);
    expect(list_notes(database, user_id, skill.id)).toHaveLength(1);
  });

  it('deletes notes, with a 404 for unknown ones', async () => {
    const note = await create_study_notes({ database, ai_provider, user_id, skill_id: skill.id, topic: 'Cells' });

    delete_note(database, user_id, note.id);

    expect(list_notes(database, user_id, skill.id)).toEqual([]);
    expect(() => delete_note(database, user_id, note.id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('quizzes', () => {
  it('generates and saves a quiz, returning it without the answers', async () => {
    const quiz = await create_practice_quiz({
      database,
      ai_provider,
      user_id,
      skill,
      quiz_details: { scope: 'topic', topic: 'Photosynthesis', question_count: 3 },
    });

    expect(quiz.questions).toHaveLength(3);
    expect(quiz.questions[0]).toEqual({ question: expect.any(String), choices: expect.any(Array) });
    expect(JSON.parse(get_owned_quiz(database, user_id, quiz.id).questions)[0]).toHaveProperty('correct_index');
  });

  it('lists quizzes with question counts and deletes them', async () => {
    const quiz = await create_practice_quiz({
      database,
      ai_provider,
      user_id,
      skill,
      quiz_details: { scope: 'topic', topic: 'Cells', question_count: 3 },
    });

    expect(list_quizzes(database, user_id, skill.id)).toEqual([
      expect.objectContaining({ id: quiz.id, topic: 'Cells', scope: 'topic', resource_id: null, question_count: 3 }),
    ]);

    delete_quiz(database, user_id, quiz.id);
    expect(list_quizzes(database, user_id, skill.id)).toEqual([]);
    expect(() => delete_quiz(database, user_id, quiz.id)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('turns a stored quiz into its public shape', () => {
    const quiz_row = {
      id: 'quiz-1',
      skill_id: 'skill-1',
      topic: 'Cells',
      created_at: 'now',
      questions: JSON.stringify([{ question: 'Q?', choices: ['a', 'b', 'c', 'd'], correct_index: 2, explanation: 'Because.' }]),
    };

    expect(to_public_quiz({ ...quiz_row, skill_node_id: null, scope: 'topic', resource_id: null })).toEqual({
      id: 'quiz-1',
      skill_id: 'skill-1',
      topic_id: null,
      scope: 'topic',
      resource_id: null,
      topic: 'Cells',
      created_at: 'now',
      questions: [{ question: 'Q?', choices: ['a', 'b', 'c', 'd'] }],
    });
  });

  it('returns a 404 for quizzes that are not the student’s', () => {
    expect(() => get_owned_quiz(database, user_id, 'missing')).toThrow(expect.objectContaining({ status: 404 }));
  });
});
