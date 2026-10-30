import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create_rate_limit } from '../middleware/rate_limit.js';

const WINDOW_MS = 60_000;

// Minimal Express response stand-in that records the status, headers and JSON body.
function create_response_stub() {
  const response_stub = {};
  response_stub.set = vi.fn(() => response_stub);
  response_stub.status = vi.fn(() => response_stub);
  response_stub.json = vi.fn(() => response_stub);
  return response_stub;
}

// Sends one request from address through rate_limit; returns true if it was let through.
function send_request(rate_limit, address, body = {}) {
  const next = vi.fn();
  rate_limit({ ip: address, body }, create_response_stub(), next);
  return next.mock.calls.length === 1;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('create_rate_limit', () => {
  it('lets max_requests through per address, then answers 429 with Retry-After', () => {
    const rate_limit = create_rate_limit({ max_requests: 2, window_ms: WINDOW_MS });
    const response = create_response_stub();

    expect(send_request(rate_limit, '1.1.1.1')).toBe(true);
    expect(send_request(rate_limit, '1.1.1.1')).toBe(true);
    rate_limit({ ip: '1.1.1.1' }, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.set).toHaveBeenCalledWith('Retry-After', '60');
    expect(response.json.mock.calls[0][0].error).toMatch('Too many attempts');
    expect(send_request(rate_limit, '2.2.2.2')).toBe(true);
  });

  it('starts counting again once the window ends', () => {
    const rate_limit = create_rate_limit({ max_requests: 1, window_ms: WINDOW_MS });

    expect(send_request(rate_limit, '1.1.1.1')).toBe(true);
    expect(send_request(rate_limit, '1.1.1.1')).toBe(false);
    vi.advanceTimersByTime(WINDOW_MS);

    expect(send_request(rate_limit, '1.1.1.1')).toBe(true);
  });

  it('counts by key_for when given', () => {
    const rate_limit = create_rate_limit({ max_requests: 1, window_ms: WINDOW_MS, key_for: (req) => req.body.email });

    expect(send_request(rate_limit, '1.1.1.1', { email: 'a@x.com' })).toBe(true);
    expect(send_request(rate_limit, '1.1.1.1', { email: 'a@x.com' })).toBe(false);
    expect(send_request(rate_limit, '1.1.1.1', { email: 'b@x.com' })).toBe(true);
  });
});
