import { describe, expect, it } from 'vitest';
import {
  clean_quiz_answer,
  validate_learning_profile,
  validate_quiz_answer,
} from '../services/learning_profile_validators.js';
import { VALID_LEARNING_ANSWERS } from './helpers/learning_answers.js';

const SINGLE_QUESTION = {
  id: 'style',
  type: 'single',
  options: [{ value: 'visual' }, { value: 'auditory' }],
};
const MULTIPLE_QUESTION = {
  id: 'times',
  type: 'multiple',
  min_choices: 1,
  max_choices: 2,
  options: [{ value: 'morning' }, { value: 'evening' }, { value: 'night' }],
};
const OPTIONAL_TEXT_QUESTION = { id: 'details', type: 'text', required: false, max_length: 10 };
const REQUIRED_TEXT_QUESTION = { id: 'name', type: 'text', max_length: 10 };

describe('validate_quiz_answer', () => {
  it('accepts only a listed option for single choice', () => {
    expect(validate_quiz_answer(SINGLE_QUESTION, 'visual')).toBeNull();
    expect(validate_quiz_answer(SINGLE_QUESTION, 'smell')).toBe('Choose one option');
    expect(validate_quiz_answer(SINGLE_QUESTION, undefined)).toBe('Choose one option');
  });

  it('enforces the choice limits for multiple choice', () => {
    expect(validate_quiz_answer(MULTIPLE_QUESTION, ['morning'])).toBeNull();
    expect(validate_quiz_answer(MULTIPLE_QUESTION, [])).toBe('Choose at least 1');
    expect(validate_quiz_answer(MULTIPLE_QUESTION, 'morning')).toBe('Choose at least 1');
    expect(validate_quiz_answer(MULTIPLE_QUESTION, ['noon'])).toBe('Choose from the options shown');
    expect(validate_quiz_answer(MULTIPLE_QUESTION, ['morning', 'evening', 'night'])).toBe('Choose up to 2');
  });

  it('counts repeated choices once', () => {
    expect(validate_quiz_answer(MULTIPLE_QUESTION, ['morning', 'morning', 'evening'])).toBeNull();
  });

  it('allows skipping optional text but not required text', () => {
    expect(validate_quiz_answer(OPTIONAL_TEXT_QUESTION, undefined)).toBeNull();
    expect(validate_quiz_answer(OPTIONAL_TEXT_QUESTION, '')).toBeNull();
    expect(validate_quiz_answer(REQUIRED_TEXT_QUESTION, '')).toBe('This answer is required');
  });

  it('rejects non-text and over-long text', () => {
    expect(validate_quiz_answer(OPTIONAL_TEXT_QUESTION, 42)).toBe('Enter text');
    expect(validate_quiz_answer(OPTIONAL_TEXT_QUESTION, 'x'.repeat(11))).toBe('Keep it under 10 characters');
  });
});

describe('clean_quiz_answer', () => {
  it('removes duplicate choices, trims text and stores skipped text as empty', () => {
    expect(clean_quiz_answer(MULTIPLE_QUESTION, ['morning', 'morning'])).toEqual(['morning']);
    expect(clean_quiz_answer(OPTIONAL_TEXT_QUESTION, '  hi  ')).toBe('hi');
    expect(clean_quiz_answer(OPTIONAL_TEXT_QUESTION, undefined)).toBe('');
    expect(clean_quiz_answer(SINGLE_QUESTION, 'visual')).toBe('visual');
  });
});

describe('validate_learning_profile', () => {
  it('returns cleaned answers for a full valid set', () => {
    const { field_errors, values } = validate_learning_profile(VALID_LEARNING_ANSWERS);

    expect(field_errors).toEqual({});
    expect(values.goal_details).toBe('Get a B in biology');
    expect(values.study_times).toEqual(['evening', 'morning']);
  });

  it('ignores keys that are not questions', () => {
    const { values } = validate_learning_profile({ ...VALID_LEARNING_ANSWERS, is_admin: true });

    expect(values).not.toHaveProperty('is_admin');
  });

  it('reports every unanswered required question', () => {
    const { field_errors } = validate_learning_profile(undefined, [SINGLE_QUESTION, OPTIONAL_TEXT_QUESTION]);

    expect(field_errors).toEqual({ style: 'Choose one option' });
  });
});
