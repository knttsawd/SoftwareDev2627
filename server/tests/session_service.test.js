import { beforeEach, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, MS_PER_DAY, SESSION_LIFETIME_DAYS } from '../config/constants.js';
import { open_database } from '../db/database.js';
import {
  create_session,
  delete_expired_sessions,
  delete_other_sessions,
  delete_session,
  find_session_user_id,
  hash_session_token,
} from '../services/session_service.js';
import { create_test_account } from './helpers/test_accounts.js';

const LOGIN_TIME = new Date('2026-10-24T12:00:00.000Z');
const AFTER_EXPIRY = new Date(LOGIN_TIME.getTime() + (SESSION_LIFETIME_DAYS + 1) * MS_PER_DAY);

let database;
let user_id;

beforeEach(async () => {
  database = open_database(IN_MEMORY_DATABASE);
  user_id = (await create_test_account(database)).id;
});

// Counts the rows in the sessions table.
function count_sessions() {
  return database.prepare('SELECT count(*) AS session_count FROM sessions').get().session_count;
}

describe('hash_session_token', () => {
  it('is a stable SHA-256 hex digest that differs from the token', () => {
    expect(hash_session_token('abc')).toBe(hash_session_token('abc'));
    expect(hash_session_token('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('delete_other_sessions', () => {
  it('keeps only the given session for the student, and leaves other students alone', async () => {
    const kept_token = create_session(database, user_id, LOGIN_TIME);
    create_session(database, user_id, LOGIN_TIME);
    const other_user_id = (await create_test_account(database, { username: 'other_sam', email: 'other@example.com' })).id;
    create_session(database, other_user_id, LOGIN_TIME);

    delete_other_sessions(database, user_id, kept_token);

    expect(count_sessions()).toBe(2);
    expect(find_session_user_id(database, kept_token, LOGIN_TIME)).toBe(user_id);
  });
});

describe('create_session', () => {
  it('returns a token and stores only its hash', () => {
    const session_token = create_session(database, user_id, LOGIN_TIME);

    const { token_hash } = database.prepare('SELECT token_hash FROM sessions').get();
    expect(token_hash).toBe(hash_session_token(session_token));
    expect(token_hash).not.toBe(session_token);
  });
});

describe('find_session_user_id', () => {
  it('finds the owner of a live session', () => {
    const session_token = create_session(database, user_id, LOGIN_TIME);

    expect(find_session_user_id(database, session_token, LOGIN_TIME)).toBe(user_id);
  });

  it('returns null for unknown or expired tokens', () => {
    const session_token = create_session(database, user_id, LOGIN_TIME);

    expect(find_session_user_id(database, 'not-a-token', LOGIN_TIME)).toBeNull();
    expect(find_session_user_id(database, session_token, AFTER_EXPIRY)).toBeNull();
  });
});

describe('delete_session', () => {
  it('ends only the given session', () => {
    const first_token = create_session(database, user_id, LOGIN_TIME);
    const second_token = create_session(database, user_id, LOGIN_TIME);

    delete_session(database, first_token);

    expect(find_session_user_id(database, first_token, LOGIN_TIME)).toBeNull();
    expect(find_session_user_id(database, second_token, LOGIN_TIME)).toBe(user_id);
  });
});

describe('delete_expired_sessions', () => {
  it('removes expired sessions and keeps live ones', () => {
    create_session(database, user_id, LOGIN_TIME);

    delete_expired_sessions(database, LOGIN_TIME);
    expect(count_sessions()).toBe(1);

    delete_expired_sessions(database, AFTER_EXPIRY);
    expect(count_sessions()).toBe(0);
  });
});
