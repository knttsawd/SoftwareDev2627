import {
  BREAK_MINUTES,
  EMAIL_PATTERN,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  WORK_BLOCK_MINUTES,
} from '../config/constants.js';

// Each validate_* function returns an error message for the field, or null when it is valid.

export function validate_username(username) {
  if (typeof username !== 'string' || username.trim() === '') return 'Username is required';
  const trimmed_username = username.trim();
  if (trimmed_username.length < USERNAME_MIN_LENGTH || trimmed_username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters`;
  }
  if (!USERNAME_PATTERN.test(trimmed_username)) {
    return 'Username can only use letters, numbers and underscores';
  }
  return null;
}

// Passwords are not trimmed: spaces are allowed and count toward the length.
export function validate_password(password) {
  if (typeof password !== 'string' || password === '') return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
}

export function validate_email(email) {
  if (typeof email !== 'string' || email.trim() === '') return 'Email is required';
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address';
  return null;
}

// field_label is the human name used in the message, e.g. "First name".
export function validate_name(name, field_label) {
  if (typeof name !== 'string' || name.trim() === '') return `${field_label} is required`;
  if (name.trim().length > NAME_MAX_LENGTH) {
    return `${field_label} must be at most ${NAME_MAX_LENGTH} characters`;
  }
  return null;
}

// Timer lengths: a whole number of minutes within limits ({ min, max }).
export function validate_minutes(minutes, limits, field_label) {
  if (!Number.isInteger(minutes) || minutes < limits.min || minutes > limits.max) {
    return `${field_label} must be a whole number from ${limits.min} to ${limits.max} minutes`;
  }
  return null;
}

const FIELD_VALIDATORS = {
  username: validate_username,
  password: validate_password,
  email: validate_email,
  first_name: (value) => validate_name(value, 'First name'),
  last_name: (value) => validate_name(value, 'Last name'),
  work_minutes: (value) => validate_minutes(value, WORK_BLOCK_MINUTES, 'Focus time'),
  break_minutes: (value) => validate_minutes(value, BREAK_MINUTES, 'Break time'),
};

const SIGNUP_FIELDS = ['username', 'password', 'email', 'first_name', 'last_name'];
const ACCOUNT_UPDATE_FIELDS = [...SIGNUP_FIELDS, 'work_minutes', 'break_minutes'];
// Changing these needs the current password too, so someone at an unlocked computer
// can't take the account over.
export const PASSWORD_PROTECTED_FIELDS = ['email', 'password'];

// Trims text fields and lowercases email, leaving the password exactly as typed and
// numbers (timer lengths) as they are.
export function clean_account_field(field_name, value) {
  if (field_name === 'password' || typeof value === 'number') return value;
  if (field_name === 'email') return value.trim().toLowerCase();
  return value.trim();
}

// Validates the listed fields of input and returns { field_errors, values }.
// field_errors maps field name to message; values holds the cleaned valid fields.
function validate_fields(input, field_names) {
  const field_errors = {};
  const values = {};
  for (const field_name of field_names) {
    const error_message = FIELD_VALIDATORS[field_name](input?.[field_name]);
    if (error_message) {
      field_errors[field_name] = error_message;
    } else {
      values[field_name] = clean_account_field(field_name, input[field_name]);
    }
  }
  return { field_errors, values };
}

// Every sign-up field is required.
export function validate_signup_input(input) {
  return validate_fields(input, SIGNUP_FIELDS);
}

// Account edits are partial: only fields present in input are checked, but at least one is
// needed. Changing the email or password also needs current_password, which the route
// checks against the stored hash; it is not part of values.
export function validate_account_updates(input) {
  const present_fields = ACCOUNT_UPDATE_FIELDS.filter((field_name) => input?.[field_name] !== undefined);
  if (present_fields.length === 0) {
    return { field_errors: { form: 'Nothing to update' }, values: {} };
  }
  const { field_errors, values } = validate_fields(input, present_fields);
  const needs_current_password = present_fields.some((field_name) => PASSWORD_PROTECTED_FIELDS.includes(field_name));
  if (needs_current_password && (typeof input.current_password !== 'string' || input.current_password === '')) {
    field_errors.current_password = 'Enter your current password to change your email or password';
  }
  return { field_errors, values };
}

// Deleting the account needs the password: { password }. Returns an error message or null.
export function validate_delete_confirmation(input) {
  return typeof input?.password === 'string' && input.password !== '' ? null : 'Enter your password to delete your account';
}

// Login only checks that both fields were filled in: password length rules belong to sign-up.
export function validate_login_input(input) {
  const field_errors = {};
  const email_error = validate_email(input?.email);
  if (email_error) field_errors.email = email_error;
  if (typeof input?.password !== 'string' || input.password === '') field_errors.password = 'Password is required';

  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return { field_errors, values: { email: clean_account_field('email', input.email), password: input.password } };
}
