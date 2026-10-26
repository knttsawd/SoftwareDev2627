import { createHash, randomBytes } from 'node:crypto';
import { MS_PER_DAY, SESSION_LIFETIME_DAYS, SESSION_TOKEN_BYTES } from '../config/constants.js';

// Only this hash is stored, never the token itself.
export function hash_session_token(session_token) {
  return createHash('sha256').update(session_token).digest('hex');
}

// Removes every session past its expiry time. Called whenever a new session is made,
// so the table never grows without limit.
export function delete_expired_sessions(database, now = new Date()) {
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
}

// Starts a session for the user and returns the random token the client must send as
// "Authorization: Bearer <token>". It expires after SESSION_LIFETIME_DAYS.
export function create_session(database, user_id, now = new Date()) {
  delete_expired_sessions(database, now);
  const session_token = randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  const expires_at = new Date(now.getTime() + SESSION_LIFETIME_DAYS * MS_PER_DAY).toISOString();
  database
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hash_session_token(session_token), user_id, expires_at);
  return session_token;
}

// Returns the id of the user who owns an unexpired session token, or null.
export function find_session_user_id(database, session_token, now = new Date()) {
  const session_row = database
    .prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(hash_session_token(session_token), now.toISOString());
  return session_row?.user_id ?? null;
}

// Logs the student out everywhere except the device they're using, e.g. after a password
// change, so an old session someone else may have can't be used.
export function delete_other_sessions(database, user_id, kept_session_token) {
  database
    .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
    .run(user_id, hash_session_token(kept_session_token));
}

// Ends one session (logging out on this device only).
export function delete_session(database, session_token) {
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash_session_token(session_token));
}
