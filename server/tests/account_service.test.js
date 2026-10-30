import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import {
  assert_identity_available,
  assert_password_matches,
  authenticate,
  build_user_updates,
  delete_account,
  get_account,
  is_email_taken,
  is_username_taken,
  to_account,
  update_account,
} from '../services/account_service.js';
import { verify_password } from '../services/password_service.js';
import { create_session } from '../services/session_service.js';
import { get_user_folder } from '../services/storage_service.js';
import { create_test_account, TEST_SIGNUP } from './helpers/test_accounts.js';

let database;

beforeEach(() => {
  database = open_database(IN_MEMORY_DATABASE);
});

// Reads a stored password hash straight from the database.
function read_password_hash(user_id) {
  return database.prepare('SELECT password_hash FROM users WHERE id = ?').get(user_id).password_hash;
}

describe('to_account', () => {
  it('parses learning_profile into an object', () => {
    expect(to_account({ id: 'user-1', learning_profile: '{"style":"visual"}' })).toEqual({
      id: 'user-1',
      learning_profile: { style: 'visual' },
    });
  });
});

describe('create_account', () => {
  it('stores the student with a hashed password and returns the account without it', async () => {
    const account = await create_test_account(database);

    expect(account).toMatchObject({
      username: 'study_sam',
      email: 'sam@example.com',
      first_name: 'Sam',
      last_name: 'Lee',
      learning_profile: {},
      work_minutes: 25,
      break_minutes: 5,
    });
    expect(account).not.toHaveProperty('password_hash');
    await expect(verify_password('correct horse', read_password_hash(account.id))).resolves.toBe(true);
  });

  it('refuses a username or email already in use, in any letter case', async () => {
    await create_test_account(database);

    await expect(
      create_test_account(database, { username: 'STUDY_SAM', email: 'new@example.com' }),
    ).rejects.toMatchObject({ status: 409, extra_body: { field_errors: { username: 'That username is already taken' } } });
    await expect(create_test_account(database, { username: 'new_name' })).rejects.toMatchObject({
      status: 409,
      extra_body: { field_errors: { email: 'An account with that email already exists' } },
    });
  });
});

describe('is_username_taken and is_email_taken', () => {
  it('match case-insensitively and can exclude one user', async () => {
    const { id } = await create_test_account(database);

    expect(is_username_taken(database, 'Study_Sam')).toBe(true);
    expect(is_username_taken(database, 'study_sam', id)).toBe(false);
    expect(is_email_taken(database, 'SAM@example.com')).toBe(true);
    expect(is_email_taken(database, 'sam@example.com', id)).toBe(false);
  });
});

describe('assert_identity_available', () => {
  it('only checks the fields it is given', async () => {
    await create_test_account(database);

    expect(() => assert_identity_available(database, { first_name: 'Sam' })).not.toThrow();
    expect(() => assert_identity_available(database, { email: 'sam@example.com' })).toThrow(
      'An account with that email already exists',
    );
  });
});

describe('get_account', () => {
  it('returns the account, or a 404 for an unknown id', async () => {
    const { id } = await create_test_account(database);

    expect(get_account(database, id).username).toBe('study_sam');
    expect(() => get_account(database, 'missing')).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('authenticate', () => {
  it('returns the account for the right email (any case) and password', async () => {
    await create_test_account(database);

    await expect(authenticate(database, 'SAM@example.com', TEST_SIGNUP.password)).resolves.toMatchObject({
      username: 'study_sam',
    });
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await create_test_account(database);

    await expect(authenticate(database, 'sam@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Incorrect email or password',
    });
    await expect(authenticate(database, 'nobody@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Incorrect email or password',
    });
  });
});

describe('build_user_updates', () => {
  it('keeps editable columns and swaps a password for its hash', async () => {
    const user_updates = await build_user_updates({ first_name: 'Alex', password: 'new password' });

    expect(user_updates.first_name).toBe('Alex');
    expect(user_updates).not.toHaveProperty('password');
    await expect(verify_password('new password', user_updates.password_hash)).resolves.toBe(true);
  });
});

describe('update_account', () => {
  it('changes profile fields and returns the updated account', async () => {
    const { id } = await create_test_account(database);

    const updated_account = await update_account(database, id, { first_name: 'Alex', email: 'alex@example.com' });

    expect(updated_account).toMatchObject({ first_name: 'Alex', email: 'alex@example.com', last_name: 'Lee' });
  });

  it('lets a student keep their own username and changes the password', async () => {
    const { id } = await create_test_account(database);

    await update_account(database, id, { username: 'study_sam', password: 'brand new pass' });

    await expect(verify_password('brand new pass', read_password_hash(id))).resolves.toBe(true);
  });

  it("refuses another student's username", async () => {
    const { id } = await create_test_account(database);
    await create_test_account(database, { username: 'taken_name', email: 'other@example.com' });

    await expect(update_account(database, id, { username: 'taken_name' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('assert_password_matches', () => {
  it('accepts the right password and names the field for a wrong or missing one', async () => {
    const { id } = await create_test_account(database);

    await expect(assert_password_matches(database, id, TEST_SIGNUP.password, 'current_password')).resolves.toBeUndefined();
    await expect(assert_password_matches(database, id, 'wrong', 'current_password')).rejects.toMatchObject({
      status: 400,
      extra_body: { field_errors: { current_password: "That isn't your current password" } },
    });
    await expect(assert_password_matches(database, id, undefined, 'password')).rejects.toMatchObject({ status: 400 });
  });
});

describe('delete_account', () => {
  let uploads_path;

  afterEach(() => {
    rmSync(uploads_path, { recursive: true, force: true });
  });

  it('removes the user, their sessions and their uploads folder', async () => {
    uploads_path = mkdtempSync(path.join(tmpdir(), 'studyapp-uploads-'));
    const { id } = await create_test_account(database);
    create_session(database, id);
    mkdirSync(get_user_folder(uploads_path, id));

    await delete_account(database, uploads_path, id);

    expect(database.prepare('SELECT count(*) AS user_count FROM users').get().user_count).toBe(0);
    expect(database.prepare('SELECT count(*) AS session_count FROM sessions').get().session_count).toBe(0);
    expect(existsSync(get_user_folder(uploads_path, id))).toBe(false);
  });
});
