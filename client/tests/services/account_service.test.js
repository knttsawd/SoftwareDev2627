import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/auth_service.js', () => ({ send_authed_request: vi.fn() }));

const { send_authed_request } = await import('../../src/services/auth_service.js');
const { read_session_token, save_session_token } = await import('../../src/services/session_store.js');
const { delete_account, fetch_account, update_account } = await import('../../src/services/account_service.js');

beforeEach(() => {
  vi.clearAllMocks();
  save_session_token('token-1');
});

describe('fetch_account', () => {
  it('loads the signed-in account', async () => {
    send_authed_request.mockResolvedValue({ username: 'sam' });

    await expect(fetch_account()).resolves.toEqual({ username: 'sam' });
    expect(send_authed_request).toHaveBeenCalledWith('/account');
  });
});

describe('update_account', () => {
  it('sends the changes as a PATCH', async () => {
    send_authed_request.mockResolvedValue({ first_name: 'Alex' });

    await expect(update_account({ first_name: 'Alex' })).resolves.toEqual({ first_name: 'Alex' });
    expect(send_authed_request).toHaveBeenCalledWith('/account', { method: 'PATCH', body: { first_name: 'Alex' } });
  });
});

describe('delete_account', () => {
  it('deletes on the server and then forgets the token', async () => {
    send_authed_request.mockResolvedValue(null);

    await delete_account('my password');

    expect(send_authed_request).toHaveBeenCalledWith('/account', { method: 'DELETE', body: { password: 'my password' } });
    expect(read_session_token()).toBeNull();
  });

  it('keeps the token when the server delete fails', async () => {
    send_authed_request.mockRejectedValue(new Error('Server down'));

    await expect(delete_account('my password')).rejects.toThrow('Server down');
    expect(read_session_token()).toBe('token-1');
  });
});
