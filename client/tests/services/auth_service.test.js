import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/api_client.js', () => ({ api_request: vi.fn() }));

const { api_request } = await import('../../src/services/api_client.js');
const { clear_session_token, read_session_token, save_session_token } = await import(
  '../../src/services/session_store.js'
);
const { check_username_available, is_logged_in, log_in, log_out, send_authed_request, sign_up } = await import(
  '../../src/services/auth_service.js'
);

const ACCOUNT = { id: 'user-1', username: 'study_sam' };

// Builds an error shaped like the ones api_request throws.
function create_request_error(status) {
  const request_error = new Error('Request failed');
  request_error.status = status;
  return request_error;
}

beforeEach(() => {
  vi.clearAllMocks();
  clear_session_token();
});

describe('is_logged_in', () => {
  it('is true only while a token is saved', () => {
    expect(is_logged_in()).toBe(false);
    save_session_token('token-1');
    expect(is_logged_in()).toBe(true);
  });
});

describe('send_authed_request', () => {
  it('attaches the saved token to the API request', async () => {
    save_session_token('token-1');
    api_request.mockResolvedValue({ ok: true });

    await send_authed_request('/account', { method: 'PATCH', body: { first_name: 'Sam' } });

    expect(api_request).toHaveBeenCalledWith('/account', {
      method: 'PATCH',
      body: { first_name: 'Sam' },
      access_token: 'token-1',
    });
  });

  it('drops the token when the server says the session ended', async () => {
    save_session_token('stale-token');
    api_request.mockRejectedValue(create_request_error(401));

    await expect(send_authed_request('/account')).rejects.toThrow('Request failed');
    expect(read_session_token()).toBeNull();
  });

  it('keeps the token for other errors', async () => {
    save_session_token('token-1');
    api_request.mockRejectedValue(create_request_error(500));

    await expect(send_authed_request('/account')).rejects.toThrow();
    expect(read_session_token()).toBe('token-1');
  });
});

describe('check_username_available', () => {
  it('asks the API with the username safely encoded', async () => {
    api_request.mockResolvedValue({ is_available: false });

    await expect(check_username_available('sam&co')).resolves.toBe(false);
    expect(api_request).toHaveBeenCalledWith('/auth/check-username?username=sam%26co');
  });
});

describe('sign_up', () => {
  it('creates the account, saves the token and returns the account', async () => {
    api_request.mockResolvedValue({ token: 'token-1', account: ACCOUNT });
    const signup_details = { email: 'sam@example.com', password: 'password1', username: 'study_sam' };

    await expect(sign_up(signup_details)).resolves.toEqual(ACCOUNT);
    expect(api_request).toHaveBeenCalledWith('/auth/signup', { method: 'POST', body: signup_details });
    expect(read_session_token()).toBe('token-1');
  });
});

describe('log_in', () => {
  it('saves the token and returns the account', async () => {
    api_request.mockResolvedValue({ token: 'token-2', account: ACCOUNT });

    await expect(log_in('sam@example.com', 'password1')).resolves.toEqual(ACCOUNT);
    expect(api_request).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { email: 'sam@example.com', password: 'password1' },
    });
    expect(read_session_token()).toBe('token-2');
  });

  it('saves nothing when the login fails', async () => {
    api_request.mockRejectedValue(create_request_error(401));

    await expect(log_in('sam@example.com', 'wrong')).rejects.toThrow();
    expect(read_session_token()).toBeNull();
  });
});

describe('log_out', () => {
  it('ends the server session and forgets the token', async () => {
    save_session_token('token-1');
    api_request.mockResolvedValue(null);

    await log_out();

    expect(api_request).toHaveBeenCalledWith('/auth/logout', { method: 'POST', access_token: 'token-1' });
    expect(read_session_token()).toBeNull();
  });

  it('still forgets the token when the server cannot be reached', async () => {
    save_session_token('token-1');
    api_request.mockRejectedValue(new Error('Network error'));

    await expect(log_out()).rejects.toThrow('Network error');
    expect(read_session_token()).toBeNull();
  });
});
