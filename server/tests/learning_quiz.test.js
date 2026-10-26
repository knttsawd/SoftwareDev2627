import { describe, expect, it } from 'vitest';
import { LEARNING_QUIZ_QUESTIONS } from '../config/learning_quiz.js';

const QUESTION_TYPES = ['single', 'multiple', 'text'];

describe('LEARNING_QUIZ_QUESTIONS', () => {
  it('covers learning style, goals, schedule, strengths and weaknesses', () => {
    const question_ids = LEARNING_QUIZ_QUESTIONS.map((question) => question.id);

    expect(question_ids).toEqual(
      expect.arrayContaining(['learning_style', 'main_goal', 'weekly_hours', 'study_times', 'strengths', 'weaknesses']),
    );
  });

  it('has unique ids, known types and options for every choice question', () => {
    const question_ids = LEARNING_QUIZ_QUESTIONS.map((question) => question.id);
    expect(new Set(question_ids).size).toBe(question_ids.length);

    for (const question of LEARNING_QUIZ_QUESTIONS) {
      expect(QUESTION_TYPES).toContain(question.type);
      if (question.type !== 'text') expect(question.options.length).toBeGreaterThan(1);
    }
  });

  it('gives every session length option timer minutes', () => {
    const session_question = LEARNING_QUIZ_QUESTIONS.find((question) => question.id === 'session_length');

    for (const option of session_question.options) {
      expect(option.work_minutes).toBeGreaterThan(0);
      expect(option.break_minutes).toBeGreaterThan(0);
    }
  });
});
