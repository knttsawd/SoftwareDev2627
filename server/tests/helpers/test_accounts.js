import { create_account } from '../../services/account_service.js';

export const TEST_SIGNUP = {
  username: 'study_sam',
  password: 'correct horse',
  email: 'sam@example.com',
  first_name: 'Sam',
  last_name: 'Lee',
};

// Creates an account from TEST_SIGNUP, with any fields swapped for those in overrides.
export function create_test_account(database, overrides = {}) {
  return create_account(database, { ...TEST_SIGNUP, ...overrides });
}
