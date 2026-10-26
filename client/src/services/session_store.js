import { SESSION_TOKEN_STORAGE_KEY } from '../config/constants.js';

// Keeps the login token in localStorage so the student stays logged in across visits.
// Some browsers (private modes, blocked site data) throw on localStorage access; in that
// case the student stays logged in only until the page is closed.

let fallback_token = null;

export function read_session_token() {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return fallback_token;
  }
}

export function save_session_token(session_token) {
  fallback_token = session_token;
  try {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, session_token);
  } catch {
    // Storage is unavailable; fallback_token already holds the token for this page visit.
  }
}

export function clear_session_token() {
  fallback_token = null;
  try {
    window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Storage is unavailable, so there is nothing stored to remove.
  }
}
