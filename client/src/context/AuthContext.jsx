import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SESSION_TOKEN_STORAGE_KEY } from '../config/constants.js';
import { fetch_account } from '../services/account_service.js';
import * as auth_service from '../services/auth_service.js';
import { DATA_CHANGED_EVENT, SESSION_ENDED_EVENT } from '../utils/data_events.js';

export const AUTH_STATUS = {
  loading: 'loading',
  signed_in: 'signed_in',
  signed_out: 'signed_out',
};

// Why the student was signed out without pressing "Log out", so the login page can say so.
export const SIGN_OUT_REASONS = {
  session_ended: 'session_ended',
  logged_out_elsewhere: 'logged_out_elsewhere',
};

export const AuthContext = createContext(null);

// Holds who is logged in for the whole app. On first load, a saved token means
// "loading" until the server confirms the account; no token means "signed_out" at once.
// It also follows the login in other tabs: logging out there signs this tab out, and
// logging in as someone there loads that account here. sign_out_reason says why the
// student was last signed out without asking to be (see SIGN_OUT_REASONS), or is null.
export function AuthProvider({ children }) {
  const [account, set_account] = useState(null);
  const [status, set_status] = useState(() =>
    auth_service.is_logged_in() ? AUTH_STATUS.loading : AUTH_STATUS.signed_out,
  );
  const [sign_out_reason, set_sign_out_reason] = useState(null);

  const end_session = useCallback((reason) => {
    set_account(null);
    set_status(AUTH_STATUS.signed_out);
    set_sign_out_reason(reason);
  }, []);

  useEffect(() => {
    const handle_session_ended = () => end_session(SIGN_OUT_REASONS.session_ended);
    function handle_storage(storage_event) {
      if (storage_event.key !== SESSION_TOKEN_STORAGE_KEY) return;
      if (!storage_event.newValue) {
        end_session(SIGN_OUT_REASONS.logged_out_elsewhere);
        return;
      }
      fetch_account()
        .then((loaded_account) => {
          set_account(loaded_account);
          set_status(AUTH_STATUS.signed_in);
        })
        .catch(() => end_session(SIGN_OUT_REASONS.session_ended));
    }
    window.addEventListener(SESSION_ENDED_EVENT, handle_session_ended);
    window.addEventListener('storage', handle_storage);
    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, handle_session_ended);
      window.removeEventListener('storage', handle_storage);
    };
  }, [end_session]);

  useEffect(() => {
    if (!auth_service.is_logged_in()) return undefined;
    let is_current = true;
    fetch_account()
      .then((loaded_account) => {
        if (!is_current) return;
        set_account(loaded_account);
        set_status(AUTH_STATUS.signed_in);
      })
      .catch(() => {
        if (is_current) set_status(AUTH_STATUS.signed_out);
      });
    return () => {
      is_current = false;
    };
  }, []);

  // While signed in, reloads the account whenever data changes (the assistant renamed the
  // student, another tab changed the focus timer), so the sidebar and timer stay current.
  useEffect(() => {
    if (status !== AUTH_STATUS.signed_in) return undefined;
    function reload_account() {
      fetch_account()
        .then(set_account)
        .catch(() => {});
    }
    window.addEventListener(DATA_CHANGED_EVENT, reload_account);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload_account);
  }, [status]);

  const mark_signed_in = useCallback((signed_in_account) => {
    set_account(signed_in_account);
    set_status(AUTH_STATUS.signed_in);
    set_sign_out_reason(null);
  }, []);

  const sign_up = useCallback(
    async (signup_details) => mark_signed_in(await auth_service.sign_up(signup_details)),
    [mark_signed_in],
  );

  const log_in = useCallback(
    async (email, password) => mark_signed_in(await auth_service.log_in(email, password)),
    [mark_signed_in],
  );

  // The student is shown as logged out even if the server could not be reached.
  const log_out = useCallback(async () => {
    try {
      await auth_service.log_out();
    } finally {
      set_account(null);
      set_status(AUTH_STATUS.signed_out);
    }
  }, []);

  // After the account is deleted there is nothing left to log out of on the server.
  const forget_account = useCallback(() => {
    set_account(null);
    set_status(AUTH_STATUS.signed_out);
  }, []);

  const auth_value = useMemo(
    () => ({ account, status, sign_out_reason, sign_up, log_in, log_out, set_account, forget_account }),
    [account, status, sign_out_reason, sign_up, log_in, log_out, forget_account],
  );

  return <AuthContext.Provider value={auth_value}>{children}</AuthContext.Provider>;
}

// Returns { account, status, sign_out_reason, sign_up, log_in, log_out, set_account, forget_account }
// from AuthProvider.
export function use_auth() {
  const auth_value = useContext(AuthContext);
  if (!auth_value) throw new Error('use_auth must be used inside AuthProvider');
  return auth_value;
}
