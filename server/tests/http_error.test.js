import { describe, expect, it } from 'vitest';
import { assert_no_field_errors, create_http_error } from '../services/http_error.js';

describe('create_http_error', () => {
  it('creates a marked Error carrying the status, message, extra body and cause', () => {
    const underlying_error = new Error('socket hang up');
    const http_error = create_http_error(409, 'Taken', { field_errors: { username: 'Taken' } }, underlying_error);

    expect(http_error).toBeInstanceOf(Error);
    expect(http_error.is_http_error).toBe(true);
    expect(http_error.status).toBe(409);
    expect(http_error.message).toBe('Taken');
    expect(http_error.extra_body).toEqual({ field_errors: { username: 'Taken' } });
    expect(http_error.cause).toBe(underlying_error);
  });

  it('defaults the extra body to an empty object and the cause to undefined', () => {
    const http_error = create_http_error(400, 'Bad');

    expect(http_error.extra_body).toEqual({});
    expect(http_error.cause).toBeUndefined();
  });
});

describe('assert_no_field_errors', () => {
  it('does nothing when there are no errors', () => {
    expect(() => assert_no_field_errors({})).not.toThrow();
  });

  it('throws a 400 carrying the field errors', () => {
    expect(() => assert_no_field_errors({ email: 'Bad' })).toThrow(
      expect.objectContaining({ status: 400, extra_body: { field_errors: { email: 'Bad' } } }),
    );
  });
});
