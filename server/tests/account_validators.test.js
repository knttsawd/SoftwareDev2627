import { describe, expect, it } from 'vitest';
import {
  clean_account_field,
  PASSWORD_PROTECTED_FIELDS,
  validate_account_updates,
  validate_delete_confirmation,
  validate_email,
  validate_login_input,
  validate_minutes,
  validate_name,
  validate_password,
  validate_signup_input,
  validate_username,
} from '../services/account_validators.js';

const VALID_SIGNUP = {
  username: 'study_sam',
  password: 'correct horse',
  email: 'Sam@Example.com ',
  first_name: ' Sam ',
  last_name: 'Lee',
};

describe('validate_username', () => {
  it('accepts letters, numbers and underscores', () => {
    expect(validate_username('study_sam_2')).toBeNull();
  });

  it('rejects missing, too short, too long and symbol usernames', () => {
    expect(validate_username(undefined)).toBe('Username is required');
    expect(validate_username('ab')).toMatch('3 to 30');
    expect(validate_username('a'.repeat(31))).toMatch('3 to 30');
    expect(validate_username('sam!')).toMatch('letters, numbers and underscores');
  });
});

describe('validate_password', () => {
  it('accepts a password of at least 8 characters', () => {
    expect(validate_password('12345678')).toBeNull();
  });

  it('rejects missing, short and overly long passwords', () => {
    expect(validate_password('')).toBe('Password is required');
    expect(validate_password('short')).toMatch('at least 8');
    expect(validate_password('x'.repeat(129))).toMatch('at most 128');
  });
});

describe('validate_email', () => {
  it('accepts a normal email address', () => {
    expect(validate_email('sam@example.com')).toBeNull();
  });

  it('rejects missing and malformed emails', () => {
    expect(validate_email(' ')).toBe('Email is required');
    expect(validate_email('sam@example')).toBe('Enter a valid email address');
  });
});

describe('validate_name', () => {
  it('uses the field label in its messages', () => {
    expect(validate_name('', 'First name')).toBe('First name is required');
    expect(validate_name('x'.repeat(51), 'Last name')).toMatch('Last name must be at most 50');
    expect(validate_name('Sam', 'First name')).toBeNull();
  });
});

describe('clean_account_field', () => {
  it('trims text, lowercases email and leaves passwords untouched', () => {
    expect(clean_account_field('first_name', '  Sam ')).toBe('Sam');
    expect(clean_account_field('email', ' Sam@Example.COM ')).toBe('sam@example.com');
    expect(clean_account_field('password', ' pass word ')).toBe(' pass word ');
  });
});

describe('validate_signup_input', () => {
  it('returns cleaned values and no errors for a valid sign-up', () => {
    expect(validate_signup_input(VALID_SIGNUP)).toEqual({
      field_errors: {},
      values: {
        username: 'study_sam',
        password: 'correct horse',
        email: 'sam@example.com',
        first_name: 'Sam',
        last_name: 'Lee',
      },
    });
  });

  it('reports an error for every missing field', () => {
    const { field_errors } = validate_signup_input({});

    expect(Object.keys(field_errors).sort()).toEqual(['email', 'first_name', 'last_name', 'password', 'username']);
  });
});

describe('validate_account_updates', () => {
  it('only checks the fields that were sent', () => {
    expect(validate_account_updates({ first_name: 'Alex' })).toEqual({
      field_errors: {},
      values: { first_name: 'Alex' },
    });
  });

  it('ignores fields that cannot be edited', () => {
    expect(validate_account_updates({ last_name: 'Lee', id: 'someone-else' }).values).toEqual({ last_name: 'Lee' });
  });

  it('rejects an empty update', () => {
    expect(validate_account_updates({}).field_errors).toEqual({ form: 'Nothing to update' });
  });

  it('reports invalid sent fields, and asks for the current password to change the email or password', () => {
    expect(validate_account_updates({ email: 'nope', current_password: 'x' }).field_errors).toEqual({ email: 'Enter a valid email address' });
    expect(validate_account_updates({ password: 'long enough pass' }).field_errors).toEqual({
      current_password: 'Enter your current password to change your email or password',
    });
    expect(validate_account_updates({ first_name: 'Alex' }).field_errors).toEqual({});
  });

  it('checks the timer lengths and keeps them as numbers', () => {
    expect(validate_account_updates({ work_minutes: 30, break_minutes: 10 })).toEqual({
      field_errors: {},
      values: { work_minutes: 30, break_minutes: 10 },
    });
    expect(validate_account_updates({ work_minutes: 4, break_minutes: 61 }).field_errors).toEqual({
      work_minutes: 'Focus time must be a whole number from 5 to 120 minutes',
      break_minutes: 'Break time must be a whole number from 1 to 60 minutes',
    });
    expect(validate_minutes(2.5, { min: 1, max: 5 }, 'Time')).toBe('Time must be a whole number from 1 to 5 minutes');
    expect(clean_account_field('work_minutes', 25)).toBe(25);
  });

  it('needs the password to delete the account', () => {
    expect(validate_delete_confirmation({ password: 'secret' })).toBeNull();
    expect(validate_delete_confirmation({})).toBe('Enter your password to delete your account');
    expect(PASSWORD_PROTECTED_FIELDS).toEqual(['email', 'password']);
  });
});

describe('validate_login_input', () => {
  it('returns the cleaned email and the password as typed', () => {
    expect(validate_login_input({ email: ' Sam@Example.com', password: ' any length ' })).toEqual({
      field_errors: {},
      values: { email: 'sam@example.com', password: ' any length ' },
    });
  });

  it('reports missing fields', () => {
    expect(validate_login_input({}).field_errors).toEqual({
      email: 'Email is required',
      password: 'Password is required',
    });
  });
});
