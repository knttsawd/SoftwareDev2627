import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { create_require_auth, extract_bearer_token } from '../middleware/require_auth.js';
import { create_session } from '../services/session_service.js';
import { create_test_account } from './helpers/test_accounts.js';

// Minimal Express response stand-in that records the status and JSON body.
function create_response_stub() {
  const response_stub = {};
  response_stub.status = vi.fn(() => response_stub);
  response_stub.json = vi.fn(() => response_stub);
  return response_stub;
}

describe('extract_bearer_token', () => {
  it('returns the token from a Bearer header', () => {
    expect(extract_bearer_token('Bearer abc123')).toBe('abc123');
  });

  it('returns null for missing, non-Bearer or empty headers', () => {
    expect(extract_bearer_token(undefined)).toBeNull();
    expect(extract_bearer_token('Basic abc')).toBeNull();
    expect(extract_bearer_token('Bearer   ')).toBeNull();
  });
});

describe('create_require_auth', () => {
  let database;
  let require_auth;

  beforeEach(() => {
    database = open_database(IN_MEMORY_DATABASE);
    require_auth = create_require_auth(database);
  });

  it('sets req.user_id and req.session_token for a live session, then continues', async () => {
    const { id } = await create_test_account(database);
    const session_token = create_session(database, id);
    const request = { headers: { authorization: `Bearer ${session_token}` } };
    const next = vi.fn();

    require_auth(request, create_response_stub(), next);

    expect(request.user_id).toBe(id);
    expect(request.session_token).toBe(session_token);
    expect(next).toHaveBeenCalled();
  });

  it('responds 401 without a token', () => {
    const response_stub = create_response_stub();
    const next = vi.fn();

    require_auth({ headers: {} }, response_stub, next);

    expect(response_stub.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 for an unknown token', () => {
    const response_stub = create_response_stub();

    require_auth({ headers: { authorization: 'Bearer made-up' } }, response_stub, vi.fn());

    expect(response_stub.status).toHaveBeenCalledWith(401);
    expect(response_stub.json).toHaveBeenCalledWith({ error: 'Your session has expired. Please log in again' });
  });
});
