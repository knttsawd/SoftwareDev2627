import { HTTP_STATUS } from '../config/constants.js';

const RATE_LIMIT_MESSAGE = 'Too many attempts. Please wait a few minutes and try again';

// The address a request came from. The server faces the internet directly (no proxy), so
// this is the real address and can't be faked with an X-Forwarded-For header.
export function request_address(req) {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// Builds middleware that lets each key (by default the request's address) make max_requests
// requests per window_ms, then answers 429 with Retry-After until the window ends. Counts
// live in memory, which suits this single server process; old windows are cleared once per
// window so the map can't keep growing.
export function create_rate_limit({ max_requests, window_ms, key_for = request_address }) {
  const windows = new Map();
  let next_cleanup_at = Date.now() + window_ms;

  return function rate_limit(req, res, next) {
    const now = Date.now();
    if (now >= next_cleanup_at) {
      for (const [key, window] of windows) {
        if (window.ends_at <= now) windows.delete(key);
      }
      next_cleanup_at = now + window_ms;
    }

    const key = key_for(req);
    let window = windows.get(key);
    if (!window || window.ends_at <= now) {
      window = { count: 0, ends_at: now + window_ms };
      windows.set(key, window);
    }
    window.count += 1;

    if (window.count > max_requests) {
      res.set('Retry-After', String(Math.ceil((window.ends_at - now) / 1000)));
      return res.status(HTTP_STATUS.too_many_requests).json({ error: RATE_LIMIT_MESSAGE });
    }
    return next();
  };
}
