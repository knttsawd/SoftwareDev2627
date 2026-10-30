import { describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { get_timer_preferences, save_learning_profile } from '../services/learning_profile_service.js';
import { validate_learning_profile } from '../services/learning_profile_validators.js';
import { VALID_LEARNING_ANSWERS } from './helpers/learning_answers.js';
import { create_test_account } from './helpers/test_accounts.js';

describe('get_timer_preferences', () => {
  it('returns the timer minutes for the chosen session length', () => {
    expect(get_timer_preferences({ session_length: 'short' })).toEqual({ work_minutes: 25, break_minutes: 5 });
    expect(get_timer_preferences({ session_length: 'long' })).toEqual({ work_minutes: 55, break_minutes: 10 });
  });
});

describe('save_learning_profile', () => {
  it('stores the answers, sets the timer and returns the updated account', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { id } = await create_test_account(database);
    const { values } = validate_learning_profile(VALID_LEARNING_ANSWERS);

    const updated_account = save_learning_profile(database, id, values);

    expect(updated_account.learning_profile).toEqual(values);
    expect(updated_account.work_minutes).toBe(40);
    expect(updated_account.break_minutes).toBe(8);
  });
});
