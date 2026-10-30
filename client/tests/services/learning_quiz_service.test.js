import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_ACCOUNT, SAMPLE_QUESTIONS, TEST_ACCOUNT } from '../helpers/test_data.js';

vi.mock('../../src/services/api_client.js', () => ({ api_request: vi.fn() }));
vi.mock('../../src/services/auth_service.js', () => ({ send_authed_request: vi.fn() }));

const { api_request } = await import('../../src/services/api_client.js');
const { send_authed_request } = await import('../../src/services/auth_service.js');
const { build_initial_answers, fetch_learning_quiz, has_learning_profile, save_learning_profile, toggle_choice } =
  await import('../../src/services/learning_quiz_service.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetch_learning_quiz', () => {
  it('returns the questions from the API', async () => {
    api_request.mockResolvedValue({ questions: SAMPLE_QUESTIONS });

    await expect(fetch_learning_quiz()).resolves.toBe(SAMPLE_QUESTIONS);
    expect(api_request).toHaveBeenCalledWith('/learning-quiz');
  });
});

describe('save_learning_profile', () => {
  it('PUTs the answers and returns the updated account', async () => {
    send_authed_request.mockResolvedValue(TEST_ACCOUNT);

    await expect(save_learning_profile({ learning_style: 'visual' })).resolves.toBe(TEST_ACCOUNT);
    expect(send_authed_request).toHaveBeenCalledWith('/account/learning-profile', {
      method: 'PUT',
      body: { answers: { learning_style: 'visual' } },
    });
  });
});

describe('has_learning_profile', () => {
  it('is true only when the quiz has been answered', () => {
    expect(has_learning_profile(TEST_ACCOUNT)).toBe(true);
    expect(has_learning_profile(NEW_ACCOUNT)).toBe(false);
    expect(has_learning_profile(null)).toBe(false);
  });
});

describe('build_initial_answers', () => {
  it('starts blank: an empty list for multiple choice, empty text otherwise', () => {
    expect(build_initial_answers(SAMPLE_QUESTIONS)).toEqual({
      learning_style: '',
      study_times: [],
      goal_details: '',
    });
  });

  it('fills in saved answers when retaking the quiz', () => {
    expect(build_initial_answers(SAMPLE_QUESTIONS, { learning_style: 'auditory' }).learning_style).toBe('auditory');
  });
});

describe('toggle_choice', () => {
  it('adds a missing value and removes a present one', () => {
    expect(toggle_choice(['morning'], 'evening')).toEqual(['morning', 'evening']);
    expect(toggle_choice(['morning', 'evening'], 'morning')).toEqual(['evening']);
  });
});
