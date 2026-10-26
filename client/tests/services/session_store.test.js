import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_TOKEN_STORAGE_KEY } from '../../src/config/constants.js';
import { clear_session_token, read_session_token, save_session_token } from '../../src/services/session_store.js';

afterEach(() => {
  vi.restoreAllMocks();
  clear_session_token();
});

describe('save_session_token and read_session_token', () => {
  it('stores the token in localStorage and reads it back', () => {
    save_session_token('token-1');

    expect(window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBe('token-1');
    expect(read_session_token()).toBe('token-1');
  });

  it('keeps the token in memory when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    save_session_token('token-2');

    expect(read_session_token()).toBe('token-2');
  });
});

describe('clear_session_token', () => {
  it('forgets the token', () => {
    save_session_token('token-1');

    clear_session_token();

    expect(read_session_token()).toBeNull();
  });

  it('does not throw when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => clear_session_token()).not.toThrow();
  });
});
