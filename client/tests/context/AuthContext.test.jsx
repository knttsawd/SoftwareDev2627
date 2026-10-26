import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_ACCOUNT } from '../helpers/test_data.js';

vi.mock('../../src/services/auth_service.js', () => ({
  is_logged_in: vi.fn(),
  sign_up: vi.fn(),
  log_in: vi.fn(),
  log_out: vi.fn(),
}));
vi.mock('../../src/services/account_service.js', () => ({ fetch_account: vi.fn() }));

const auth_service = await import('../../src/services/auth_service.js');
const { fetch_account } = await import('../../src/services/account_service.js');
const { AUTH_STATUS, AuthProvider, SIGN_OUT_REASONS, use_auth } = await import('../../src/context/AuthContext.jsx');
const { notify_data_changed, notify_session_ended } = await import('../../src/utils/data_events.js');
const { SESSION_TOKEN_STORAGE_KEY } = await import('../../src/config/constants.js');

// Renders use_auth inside a real AuthProvider.
function render_auth_hook() {
  return renderHook(() => use_auth(), { wrapper: AuthProvider });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthProvider', () => {
  it('is signed out straight away when there is no saved token', () => {
    auth_service.is_logged_in.mockReturnValue(false);

    const { result } = render_auth_hook();

    expect(result.current.status).toBe(AUTH_STATUS.signed_out);
    expect(fetch_account).not.toHaveBeenCalled();
  });

  it('loads the account when a token is saved', async () => {
    auth_service.is_logged_in.mockReturnValue(true);
    fetch_account.mockResolvedValue(TEST_ACCOUNT);

    const { result } = render_auth_hook();

    expect(result.current.status).toBe(AUTH_STATUS.loading);
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.signed_in));
    expect(result.current.account).toBe(TEST_ACCOUNT);
  });

  it('is signed out when the saved token no longer works', async () => {
    auth_service.is_logged_in.mockReturnValue(true);
    fetch_account.mockRejectedValue(new Error('Session expired'));

    const { result } = render_auth_hook();

    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.signed_out));
  });

  it('forgets a deleted account without calling the server', async () => {
    auth_service.is_logged_in.mockReturnValue(false);
    auth_service.log_in.mockResolvedValue(TEST_ACCOUNT);
    const { result } = render_auth_hook();
    await act(() => result.current.log_in('sam@example.com', 'correct horse'));

    act(() => result.current.forget_account());

    expect(result.current.status).toBe(AUTH_STATUS.signed_out);
    expect(result.current.account).toBeNull();
    expect(auth_service.log_out).not.toHaveBeenCalled();
  });

  it('signs in after sign_up and log_in', async () => {
    auth_service.is_logged_in.mockReturnValue(false);
    auth_service.sign_up.mockResolvedValue(TEST_ACCOUNT);
    auth_service.log_in.mockResolvedValue({ ...TEST_ACCOUNT, first_name: 'Alex' });
    const { result } = render_auth_hook();

    await act(() => result.current.sign_up({ username: 'study_sam' }));
    expect(result.current.status).toBe(AUTH_STATUS.signed_in);
    expect(result.current.account.first_name).toBe('Sam');

    await act(() => result.current.log_in('sam@example.com', 'password1'));
    expect(result.current.account.first_name).toBe('Alex');
  });

  it('stays signed out when log_in fails', async () => {
    auth_service.is_logged_in.mockReturnValue(false);
    auth_service.log_in.mockRejectedValue(new Error('Incorrect email or password'));
    const { result } = render_auth_hook();

    await expect(act(() => result.current.log_in('sam@example.com', 'wrong'))).rejects.toThrow(
      'Incorrect email or password',
    );
    expect(result.current.status).toBe(AUTH_STATUS.signed_out);
  });

  it('signs out after log_out, even if the server call fails', async () => {
    auth_service.is_logged_in.mockReturnValue(true);
    fetch_account.mockResolvedValue(TEST_ACCOUNT);
    auth_service.log_out.mockRejectedValue(new Error('Network error'));
    const { result } = render_auth_hook();
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.signed_in));

    let log_out_error;
    await act(async () => {
      log_out_error = await result.current.log_out().catch((caught_error) => caught_error);
    });

    expect(log_out_error.message).toBe('Network error');
    expect(result.current.status).toBe(AUTH_STATUS.signed_out);
    expect(result.current.account).toBeNull();
  });

  it('signs out with a reason when the session ends, and clears it on the next login', async () => {
    auth_service.is_logged_in.mockReturnValue(true);
    fetch_account.mockResolvedValue(TEST_ACCOUNT);
    auth_service.log_in.mockResolvedValue(TEST_ACCOUNT);
    const { result } = render_auth_hook();
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.signed_in));

    act(() => notify_session_ended());
    expect(result.current).toMatchObject({ status: AUTH_STATUS.signed_out, account: null, sign_out_reason: SIGN_OUT_REASONS.session_ended });

    await act(() => result.current.log_in('sam@example.com', 'correct horse'));
    expect(result.current.sign_out_reason).toBeNull();
  });

  it('follows logging out and in from other tabs', async () => {
    auth_service.is_logged_in.mockReturnValue(true);
    fetch_account.mockResolvedValue(TEST_ACCOUNT);
    const { result } = render_auth_hook();
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.signed_in));

    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'something_else', newValue: null })));
    expect(result.current.status).toBe(AUTH_STATUS.signed_in);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_TOKEN_STORAGE_KEY, newValue: null })));
    expect(result.current.sign_out_reason).toBe(SIGN_OUT_REASONS.logged_out_elsewhere);

    fetch_account.mockResolvedValue({ ...TEST_ACCOUNT, first_name: 'Alex' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_TOKEN_STORAGE_KEY, newValue: 'new-token' })));
    await waitFor(() => expect(result.current.account?.first_name).toBe('Alex'));
    expect(result.current.status).toBe(AUTH_STATUS.signed_in);

    fetch_account.mockRejectedValue(new Error('Session expired'));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_TOKEN_STORAGE_KEY, newValue: 'bad-token' })));
    await waitFor(() => expect(result.current.sign_out_reason).toBe(SIGN_OUT_REASONS.session_ended));
  });

  it('reloads the account when data changes, keeping it if the reload fails', async () => {
    auth_service.is_logged_in.mockReturnValue(true);
    fetch_account.mockResolvedValue(TEST_ACCOUNT);
    const { result } = render_auth_hook();
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.signed_in));

    fetch_account.mockResolvedValue({ ...TEST_ACCOUNT, first_name: 'Robin' });
    act(() => notify_data_changed());
    await waitFor(() => expect(result.current.account.first_name).toBe('Robin'));

    fetch_account.mockRejectedValue(new Error('Offline'));
    act(() => notify_data_changed());
    await waitFor(() => expect(fetch_account).toHaveBeenCalledTimes(3));
    expect(result.current.account.first_name).toBe('Robin');
  });

  it('lets pages replace the account with set_account', async () => {
    auth_service.is_logged_in.mockReturnValue(false);
    const { result } = render_auth_hook();

    act(() => result.current.set_account(TEST_ACCOUNT));

    expect(result.current.account).toBe(TEST_ACCOUNT);
  });
});

describe('use_auth', () => {
  it('throws a clear error outside AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<AuthlessProbe />)).toThrow('use_auth must be used inside AuthProvider');
    expect(screen.queryByText('never shown')).not.toBeInTheDocument();
  });
});

// A component that calls use_auth without an AuthProvider around it.
function AuthlessProbe() {
  use_auth();
  return <p>never shown</p>;
}
