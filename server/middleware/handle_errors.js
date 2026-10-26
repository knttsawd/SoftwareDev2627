import { HTTP_STATUS } from '../config/constants.js';

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again';

// Catch-all for unknown routes, registered after every router.
export function handle_not_found(req, res) {
  res.status(HTTP_STATUS.not_found).json({ error: `No route for ${req.method} ${req.path}` });
}

// Express error handler: Express only treats a middleware as an error handler when it takes
// four arguments, so next stays in the signature even though it is not called.
//
// Errors made with create_http_error keep their status and message. Other errors with a 4xx
// status (e.g. invalid JSON from the body parser) keep theirs too. Anything else is an
// unexpected failure, and the student sees a generic message. Every 5xx is logged, using
// the underlying cause when there is one, so the real problem shows in the server terminal.
export function handle_errors(error, req, res, next) {
  const status = error.status ?? HTTP_STATUS.server_error;
  if (status >= HTTP_STATUS.server_error) console.error(error.cause ?? error);

  const is_safe_to_show = error.is_http_error || status < HTTP_STATUS.server_error;
  if (!is_safe_to_show) {
    return res.status(HTTP_STATUS.server_error).json({ error: GENERIC_ERROR_MESSAGE });
  }
  return res.status(status).json({ error: error.message, ...error.extra_body });
}
