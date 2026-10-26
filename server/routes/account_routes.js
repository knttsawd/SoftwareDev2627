import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_password_matches, delete_account, get_account, update_account } from '../services/account_service.js';
import { validate_account_updates, validate_delete_confirmation } from '../services/account_validators.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { save_learning_profile } from '../services/learning_profile_service.js';
import { validate_learning_profile } from '../services/learning_profile_validators.js';
import { delete_other_sessions } from '../services/session_service.js';

// Signed-in routes for the student's own account. Mounted behind require_auth, so req.user_id is set.
export function create_account_router(database, uploads_path) {
  const account_router = Router();

  // GET /api/account -> the student's account
  account_router.get('/', function read_account(req, res) {
    res.json(get_account(database, req.user_id));
  });

  // PATCH /api/account { any of username, password, email, first_name, last_name, work_minutes,
  // break_minutes, plus current_password when changing the email or password } -> updated account.
  // A new password logs out every other device.
  account_router.patch('/', async function edit_account(req, res) {
    const { field_errors, values } = validate_account_updates(req.body);
    assert_no_field_errors(field_errors);
    if (values.email !== undefined || values.password !== undefined) {
      await assert_password_matches(database, req.user_id, req.body.current_password, 'current_password');
    }
    const account = await update_account(database, req.user_id, values);
    if (values.password !== undefined) delete_other_sessions(database, req.user_id, req.session_token);
    res.json(account);
  });

  // PUT /api/account/learning-profile { answers: { question_id: answer } } -> updated account
  account_router.put('/learning-profile', function replace_learning_profile(req, res) {
    const { field_errors, values } = validate_learning_profile(req.body?.answers);
    assert_no_field_errors(field_errors);
    res.json(save_learning_profile(database, req.user_id, values));
  });

  // DELETE /api/account { password } -> 204, removes the student, their sessions, files and all their data
  account_router.delete('/', async function remove_account(req, res) {
    const password_error = validate_delete_confirmation(req.body);
    assert_no_field_errors(password_error ? { password: password_error } : {});
    await assert_password_matches(database, req.user_id, req.body.password, 'password');
    await delete_account(database, uploads_path, req.user_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return account_router;
}
