import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { authenticate, create_account, is_username_taken } from '../services/account_service.js';
import { validate_login_input, validate_signup_input, validate_username } from '../services/account_validators.js';
import { assert_no_field_errors, create_http_error } from '../services/http_error.js';
import { create_session, delete_session } from '../services/session_service.js';

// Sign-up, login and logout. Sign-up and login both answer { token, account }; the client
// keeps the token and sends it as "Authorization: Bearer <token>" from then on.
export function create_auth_router(database, require_auth) {
  const auth_router = Router();

  // GET /api/auth/check-username?username=sam -> { is_available }
  auth_router.get('/check-username', function check_username(req, res) {
    const username_error = validate_username(req.query.username);
    if (username_error) throw create_http_error(HTTP_STATUS.bad_request, username_error);

    res.json({ is_available: !is_username_taken(database, req.query.username.trim()) });
  });

  // POST /api/auth/signup { username, password, email, first_name, last_name } -> 201 { token, account }
  auth_router.post('/signup', async function sign_up(req, res) {
    const { field_errors, values } = validate_signup_input(req.body);
    assert_no_field_errors(field_errors);

    const account = await create_account(database, values);
    res.status(HTTP_STATUS.created).json({ token: create_session(database, account.id), account });
  });

  // POST /api/auth/login { email, password } -> { token, account }
  auth_router.post('/login', async function log_in(req, res) {
    const { field_errors, values } = validate_login_input(req.body);
    assert_no_field_errors(field_errors);

    const account = await authenticate(database, values.email, values.password);
    res.json({ token: create_session(database, account.id), account });
  });

  // POST /api/auth/logout -> 204, ends the session that sent the request
  auth_router.post('/logout', require_auth, function log_out(req, res) {
    delete_session(database, req.session_token);
    res.status(HTTP_STATUS.no_content).end();
  });

  return auth_router;
}
