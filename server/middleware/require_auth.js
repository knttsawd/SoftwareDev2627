import { BEARER_PREFIX, HTTP_STATUS } from '../config/constants.js';
import { find_session_user_id } from '../services/session_service.js';

// Pulls the token out of an "Authorization: Bearer <token>" header, or returns null.
export function extract_bearer_token(authorization_header) {
  if (typeof authorization_header !== 'string' || !authorization_header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  return authorization_header.slice(BEARER_PREFIX.length).trim() || null;
}

// Builds middleware that looks up the session token sent by the client. On success it sets
// req.user_id and req.session_token; otherwise it responds 401 and the route never runs.
export function create_require_auth(database) {
  return function require_auth(req, res, next) {
    const session_token = extract_bearer_token(req.headers.authorization);
    if (!session_token) {
      return res.status(HTTP_STATUS.unauthorized).json({ error: 'Please log in to continue' });
    }

    const user_id = find_session_user_id(database, session_token);
    if (!user_id) {
      return res.status(HTTP_STATUS.unauthorized).json({ error: 'Your session has expired. Please log in again' });
    }

    req.user_id = user_id;
    req.session_token = session_token;
    return next();
  };
}
