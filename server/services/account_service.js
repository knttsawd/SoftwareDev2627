import { randomUUID } from 'node:crypto';
import { HTTP_STATUS } from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { hash_password, verify_password } from './password_service.js';
import { remove_user_files } from './storage_service.js';

// password_hash is deliberately left out so it can never reach the client.
const ACCOUNT_COLUMNS =
  'id, email, username, first_name, last_name, learning_profile, work_minutes, break_minutes, created_at';

// users columns a student may change directly. update_account builds its SQL from this
// fixed list, never from request keys.
const EDITABLE_COLUMNS = ['username', 'email', 'first_name', 'last_name', 'work_minutes', 'break_minutes'];

// Turns a users row into the account sent to the client, parsing the JSON column.
export function to_account(user_row) {
  return { ...user_row, learning_profile: JSON.parse(user_row.learning_profile) };
}

// Usernames and emails are compared case-insensitively (COLLATE NOCASE in the schema).
// excluded_user_id lets a student keep their own value when editing; "IS NOT NULL" excludes nobody.
export function is_username_taken(database, username, excluded_user_id = null) {
  return Boolean(
    database.prepare('SELECT 1 FROM users WHERE username = ? AND id IS NOT ?').get(username, excluded_user_id),
  );
}

export function is_email_taken(database, email, excluded_user_id = null) {
  return Boolean(database.prepare('SELECT 1 FROM users WHERE email = ? AND id IS NOT ?').get(email, excluded_user_id));
}

// Throws a 409 with field_errors if the given username or email (whichever are present)
// already belongs to another account.
export function assert_identity_available(database, { username, email }, excluded_user_id = null) {
  const field_errors = {};
  if (username !== undefined && is_username_taken(database, username, excluded_user_id)) {
    field_errors.username = 'That username is already taken';
  }
  if (email !== undefined && is_email_taken(database, email, excluded_user_id)) {
    field_errors.email = 'An account with that email already exists';
  }
  if (Object.keys(field_errors).length > 0) {
    throw create_http_error(HTTP_STATUS.conflict, Object.values(field_errors)[0], { field_errors });
  }
}

export function get_account(database, user_id) {
  const user_row = database.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM users WHERE id = ?`).get(user_id);
  if (!user_row) throw create_http_error(HTTP_STATUS.not_found, 'Account not found');
  return to_account(user_row);
}

// The password is hashed before the uniqueness check, so the check and the insert run
// back to back with no await between them and another sign-up cannot slip in.
export async function create_account(database, signup_values) {
  const { username, password, email, first_name, last_name } = signup_values;
  const password_hash = await hash_password(password);
  assert_identity_available(database, { username, email });

  const user_id = randomUUID();
  database
    .prepare(
      'INSERT INTO users (id, email, username, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(user_id, email, username, password_hash, first_name, last_name);
  return get_account(database, user_id);
}

// Returns the account for a correct email and password. Uses one message for "no such
// email" and "wrong password" so the login form does not reveal which emails have accounts.
// Checks a password the student typed again (to change their email or password, or to
// delete the account). A wrong one is a 400 on field_name, so the form can show it there.
export async function assert_password_matches(database, user_id, password, field_name) {
  const user_row = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(user_id);
  if (!user_row || !(await verify_password(password ?? '', user_row.password_hash))) {
    const message = "That isn't your current password";
    throw create_http_error(HTTP_STATUS.bad_request, message, { field_errors: { [field_name]: message } });
  }
}

export async function authenticate(database, email, password) {
  const user_row = database.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  if (!user_row || !(await verify_password(password, user_row.password_hash))) {
    throw create_http_error(HTTP_STATUS.unauthorized, 'Incorrect email or password');
  }
  return get_account(database, user_row.id);
}

// Maps validated account changes to users columns, hashing a new password.
export async function build_user_updates(account_updates) {
  const user_updates = Object.fromEntries(
    EDITABLE_COLUMNS.filter((column_name) => account_updates[column_name] !== undefined).map((column_name) => [
      column_name,
      account_updates[column_name],
    ]),
  );
  if (account_updates.password !== undefined) {
    user_updates.password_hash = await hash_password(account_updates.password);
  }
  return user_updates;
}

// Applies validated account_updates and returns the updated account.
export async function update_account(database, user_id, account_updates) {
  const user_updates = await build_user_updates(account_updates);
  assert_identity_available(database, account_updates, user_id);

  const set_clause = Object.keys(user_updates)
    .map((column_name) => `${column_name} = ?`)
    .join(', ');
  database.prepare(`UPDATE users SET ${set_clause} WHERE id = ?`).run(...Object.values(user_updates), user_id);
  return get_account(database, user_id);
}

// Deleting the users row cascades to sessions and every student-owned table. The database
// goes first so the account is gone even if removing the files then fails.
export async function delete_account(database, uploads_path, user_id) {
  database.prepare('DELETE FROM users WHERE id = ?').run(user_id);
  await remove_user_files(uploads_path, user_id);
}
