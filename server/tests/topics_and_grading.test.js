import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IN_MEMORY_DATABASE, MAX_TOPICS_PER_SKILL } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { normalize_topic_list } from '../services/ai/topic_list.js';
import {
  average_score,
  describe_suggestion_reason,
  get_mastery_level,
  MASTERY_LEVEL,
  rank_study_suggestions,
} from '../services/mastery.js';
import {
  check_quiz_answer,
  create_practice_quiz,
  get_owned_quiz,
  grade_quiz_answers,
  list_recent_results,
  resolve_quiz_topic,
  submit_quiz_answers,
} from '../services/quiz_service.js';
import { create_skill } from '../services/skill_service.js';
import {
  is_valid_answer,
  validate_answer_check,
  validate_optional_id,
  validate_quiz_answers,
  validate_quiz_input,
  validate_topic_input,
} from '../services/study_validators.js';
import {
  add_topic,
  delete_topic,
  find_topic_by_name,
  generate_skill_topics,
  get_owned_topic,
  get_topic_map,
  list_topics,
  save_generated_topics,
  to_topic,
  update_topic_mastery,
} from '../services/topic_service.js';
import { create_spied_ai, create_student_with_skill, insert_test_resource } from './helpers/study_fixtures.js';
import { create_test_account } from './helpers/test_accounts.js';

const QUESTIONS = [
  { question: 'Q1', choices: ['a', 'b', 'c', 'd'], correct_index: 0, explanation: 'E1' },
  { question: 'Q2', choices: ['a', 'b', 'c', 'd'], correct_index: 2, explanation: 'E2' },
];

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

// Saves a quiz on topic_id straight to the database and returns its row.
function insert_quiz(topic_id) {
  const quiz_id = `quiz-${Math.random().toString(36).slice(2)}`;
  database
    .prepare('INSERT INTO quizzes (id, user_id, skill_id, skill_node_id, topic, questions) VALUES (?, ?, ?, ?, ?, ?)')
    .run(quiz_id, user_id, skill.id, topic_id, 'Cells', JSON.stringify(QUESTIONS));
  return get_owned_quiz(database, user_id, quiz_id);
}

describe('mastery', () => {
  it('turns scores into levels at the 80% and 50% lines', () => {
    expect(get_mastery_level(null)).toBe(MASTERY_LEVEL.untested);
    expect(get_mastery_level(80)).toBe(MASTERY_LEVEL.strong);
    expect(get_mastery_level(79)).toBe(MASTERY_LEVEL.developing);
    expect(get_mastery_level(50)).toBe(MASTERY_LEVEL.developing);
    expect(get_mastery_level(49)).toBe(MASTERY_LEVEL.weak);
  });

  it('averages scores to a whole percent', () => {
    expect(average_score([])).toBeNull();
    expect(average_score([50, 67, 100])).toBe(72);
  });

  it('explains each kind of suggestion', () => {
    expect(describe_suggestion_reason({ mastery_level: 'weak', mastery_score: 30 })).toMatch('Your recent score is 30%');
    expect(describe_suggestion_reason({ mastery_level: 'untested' })).toMatch("haven't been quizzed");
    expect(describe_suggestion_reason({ mastery_level: 'developing', mastery_score: 65 })).toMatch("You're at 65%");
  });

  it('suggests weakest first, then untested, then developing, never strong, at most three', () => {
    const topics = [
      { id: 't1', topic: 'Strong', mastery_score: 90, mastery_level: 'strong' },
      { id: 't2', topic: 'Developing', mastery_score: 60, mastery_level: 'developing' },
      { id: 't3', topic: 'Untested', mastery_score: null, mastery_level: 'untested' },
      { id: 't4', topic: 'Weak 40', mastery_score: 40, mastery_level: 'weak' },
      { id: 't5', topic: 'Weak 20', mastery_score: 20, mastery_level: 'weak' },
    ];

    expect(rank_study_suggestions(topics).map((suggestion) => suggestion.topic)).toEqual(['Weak 20', 'Weak 40', 'Untested']);
    expect(rank_study_suggestions([topics[0]])).toEqual([]);
  });
});

describe('topic validators', () => {
  it('check topics, optional ids and quiz input', () => {
    expect(validate_optional_id(undefined)).toBeNull();
    expect(validate_optional_id('')).toBe('Choose an item from the list');
    expect(validate_topic_input({ topic: ' Cells ' }).values).toEqual({ topic: 'Cells', parent_topic_id: null });
    expect(validate_quiz_input({ topic_id: 'topic-1' }).values).toEqual({
      scope: 'topic',
      topic: null,
      topic_id: 'topic-1',
      resource_id: null,
      question_count: 5,
    });
    expect(validate_quiz_input({}).field_errors).toEqual({ topic: 'Topic is required' });
  });

  it('check submitted answers and single-answer checks', () => {
    expect(is_valid_answer(null, QUESTIONS[0])).toBe(true);
    expect(is_valid_answer(4, QUESTIONS[0])).toBe(false);
    expect(validate_quiz_answers([0, null], QUESTIONS)).toBeNull();
    expect(validate_quiz_answers([0], QUESTIONS)).toMatch('one answer for each of the 2 questions');
    expect(validate_quiz_answers([0, 9], QUESTIONS)).toMatch('one of the choices');
    expect(validate_answer_check({ question_index: 1, answer_index: 2 }, QUESTIONS)).toBeNull();
    expect(validate_answer_check({ question_index: 5, answer_index: 0 }, QUESTIONS)).toMatch('Choose a question');
    expect(validate_answer_check({ question_index: 0, answer_index: null }, QUESTIONS)).toMatch('Choose one of the answers');
  });
});

describe('normalize_topic_list', () => {
  it('trims, drops repeats and blanks, clears self-parents and keeps the limit', () => {
    const topics = normalize_topic_list(
      [
        { topic: ' Cells ', summary: ' Basic units. ', parent_topic: 'cells' },
        { topic: 'CELLS', summary: '', parent_topic: '' },
        { topic: '', summary: 'x', parent_topic: '' },
        { topic: 'Mitosis', summary: 'Division.', parent_topic: 'Cells' },
        { topic: 'Meiosis', summary: '', parent_topic: '' },
      ],
      2,
    );

    expect(topics).toEqual([
      { topic: 'Cells', summary: 'Basic units.', parent_topic: '' },
      { topic: 'Mitosis', summary: 'Division.', parent_topic: 'Cells' },
    ]);
  });

  it('fails when nothing usable came back', () => {
    expect(() => normalize_topic_list([], 5)).toThrow(expect.objectContaining({ status: 502 }));
  });
});

describe('topic service', () => {
  it('adds topics with an optional parent and lists them with mastery levels', () => {
    const cells = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    const mitosis = add_topic(database, user_id, skill.id, { topic: 'Mitosis', parent_topic_id: cells.id });

    expect(mitosis.parent_node_id).toBe(cells.id);
    expect(list_topics(database, user_id, skill.id).map((topic) => [topic.topic, topic.mastery_level])).toEqual([
      ['Cells', 'untested'],
      ['Mitosis', 'untested'],
    ]);
    expect(to_topic({ mastery_score: 85 }).mastery_level).toBe('strong');
  });

  it('refuses duplicates, parents from other skills, and skills that are full', () => {
    add_topic(database, user_id, skill.id, { topic: 'Cells' });
    const other_skill = create_skill(database, user_id, { name: 'Chemistry' });
    const atoms = add_topic(database, user_id, other_skill.id, { topic: 'Atoms' });

    expect(() => add_topic(database, user_id, skill.id, { topic: 'cells' })).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => add_topic(database, user_id, skill.id, { topic: 'Bonds', parent_topic_id: atoms.id })).toThrow(
      'The parent topic must be in the same skill',
    );

    for (let topic_number = 1; topic_number < MAX_TOPICS_PER_SKILL; topic_number += 1) {
      add_topic(database, user_id, skill.id, { topic: `Topic ${topic_number}` });
    }
    expect(() => add_topic(database, user_id, skill.id, { topic: 'One too many' })).toThrow(`at most ${MAX_TOPICS_PER_SKILL}`);
  });

  it("hides other students' topics", async () => {
    const topic = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    const { id: other_user_id } = await create_test_account(database, { username: 'other', email: 'o@example.com' });

    expect(() => get_owned_topic(database, other_user_id, topic.id)).toThrow(expect.objectContaining({ status: 404 }));
    expect(find_topic_by_name(database, user_id, skill.id, 'CELLS').id).toBe(topic.id);
    expect(find_topic_by_name(database, user_id, skill.id, 'Atoms')).toBeNull();
  });

  it('saves generated topics, skipping existing ones and linking parents', () => {
    add_topic(database, user_id, skill.id, { topic: 'Cells' });

    const { topics, suggestions } = save_generated_topics(database, user_id, skill.id, [
      { topic: 'cells', summary: 'Duplicate', parent_topic: '' },
      { topic: 'Photosynthesis', summary: 'Making glucose.', parent_topic: '' },
      { topic: 'Calvin cycle', summary: 'Building sugar.', parent_topic: 'Photosynthesis' },
    ]);

    expect(topics.map((topic) => topic.topic)).toEqual(['Cells', 'Photosynthesis', 'Calvin cycle']);
    expect(topics[2].parent_node_id).toBe(topics[1].id);
    expect(topics[0].summary).toBeNull();
    expect(suggestions).toHaveLength(3);
  });

  it('generates topics from the resources with the AI, telling it the topics already there', async () => {
    add_topic(database, user_id, skill.id, { topic: 'Photosynthesis' });
    vi.spyOn(ai_provider, 'generate_topics');

    const topic_map = await generate_skill_topics({ database, ai_provider, user_id, skill });

    expect(ai_provider.generate_topics).toHaveBeenCalledWith(expect.objectContaining({ existing_topics: ['Photosynthesis'] }));
    expect(topic_map.topics.length).toBeGreaterThan(1);
    expect(get_topic_map(database, user_id, skill.id).topics).toHaveLength(topic_map.topics.length);
  });

  it('deletes a topic and moves its children up a level', () => {
    const cells = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    const mitosis = add_topic(database, user_id, skill.id, { topic: 'Mitosis', parent_topic_id: cells.id });

    delete_topic(database, user_id, cells.id);

    expect(get_owned_topic(database, user_id, mitosis.id).parent_node_id).toBeNull();
  });

  it('sets mastery to the average of the last three quiz scores', () => {
    const topic = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    const quiz_row = insert_quiz(topic.id);

    for (const answers of [[1, 1], [0, 1], [0, 2], [0, 2]]) submit_quiz_answers(database, user_id, quiz_row, answers);
    update_topic_mastery(database, topic.id);

    expect(get_owned_topic(database, user_id, topic.id).mastery_score).toBe(83);
  });
});

describe('grading', () => {
  it('grades answers, counting skipped questions as wrong', () => {
    const graded = grade_quiz_answers(QUESTIONS, [0, null]);

    expect(graded).toMatchObject({ correct_count: 1, total_count: 2, score: 50 });
    expect(graded.question_results[1]).toEqual({
      question: 'Q2',
      choices: ['a', 'b', 'c', 'd'],
      chosen_index: null,
      correct_index: 2,
      is_correct: false,
      explanation: 'E2',
    });
  });

  it('checks one answer without saving anything', () => {
    expect(check_quiz_answer(insert_quiz(null), 1, 2)).toEqual({ is_correct: true, correct_index: 2, explanation: 'E2' });
    expect(database.prepare('SELECT count(*) AS result_count FROM quiz_results').get().result_count).toBe(0);
  });

  it('saves the result, updates the topic, and lists recent results', () => {
    const topic = add_topic(database, user_id, skill.id, { topic: 'Cells' });

    const graded = submit_quiz_answers(database, user_id, insert_quiz(topic.id), [0, 2]);

    expect(graded.result).toMatchObject({ correct_count: 2, total_count: 2, score: 100 });
    expect(graded.topic).toMatchObject({ mastery_score: 100, mastery_level: 'strong' });
    expect(list_recent_results(database, user_id, skill.id)).toEqual([
      expect.objectContaining({ topic: 'Cells', topic_id: topic.id, score: 100 }),
    ]);
  });

  it('returns no topic for quizzes that are not on the map', () => {
    expect(submit_quiz_answers(database, user_id, insert_quiz(null), [0, 0]).topic).toBeNull();
  });
});

describe('quiz topics', () => {
  it('uses the map topic when an id is given, and matches typed topics by name', () => {
    const topic = add_topic(database, user_id, skill.id, { topic: 'Photosynthesis', summary: 'Light to sugar.' });

    expect(resolve_quiz_topic(database, user_id, skill.id, { topic_id: topic.id })).toEqual({
      topic: 'Photosynthesis',
      topic_id: topic.id,
      search_text: 'Photosynthesis Light to sugar.',
    });
    expect(resolve_quiz_topic(database, user_id, skill.id, { topic: 'photosynthesis' }).topic_id).toBe(topic.id);
    expect(resolve_quiz_topic(database, user_id, skill.id, { topic: 'Mitosis' }).topic_id).toBeNull();
  });

  it('refuses a map topic from another skill', () => {
    const other_skill = create_skill(database, user_id, { name: 'Chemistry' });
    const atoms = add_topic(database, user_id, other_skill.id, { topic: 'Atoms' });

    expect(() => resolve_quiz_topic(database, user_id, skill.id, { topic_id: atoms.id })).toThrow('different skill');
  });

  it('creates quizzes linked to the map topic', async () => {
    const topic = add_topic(database, user_id, skill.id, { topic: 'Photosynthesis' });

    const quiz = await create_practice_quiz({
      database,
      ai_provider,
      user_id,
      skill,
      quiz_details: { scope: 'topic', topic_id: topic.id, question_count: 3 },
    });

    expect(quiz).toMatchObject({ topic: 'Photosynthesis', topic_id: topic.id });
  });
});
