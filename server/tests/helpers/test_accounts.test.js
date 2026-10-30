import { describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE } from '../../config/constants.js';
import { open_database } from '../../db/database.js';
import { create_test_account } from './test_accounts.js';

describe('create_test_account', () => {
  it('creates the default test account, with overrides applied', async () => {
    const database = open_database(IN_MEMORY_DATABASE);

    const default_account = await create_test_account(database);
    const other_account = await create_test_account(database, { username: 'other', email: 'other@example.com' });

    expect(default_account.username).toBe('study_sam');
    expect(other_account.username).toBe('other');
  });
});
