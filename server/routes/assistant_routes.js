import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import {
  cancel_assistant_action,
  clear_assistant_messages,
  confirm_assistant_action,
  get_assistant_state,
  run_assistant_turn,
  set_assistant_choice,
} from '../services/assistant/assistant_service.js';
import { validate_assistant_input } from '../services/assistant/assistant_validators.js';
import { assert_no_field_errors } from '../services/http_error.js';

// /api/assistant: the assistant on every page (services/assistant/assistant_service.js).
// Behind require_auth. Messages are { id, role ("user" | "assistant"), content, actions:
// [{ id, tool, label, status, summary, link, widget_id }], created_at }.
// dependencies: { database, ai_provider, chat_assistants, resource_importer, uploads_path }
export function create_assistant_router(dependencies) {
  const { database, chat_assistants } = dependencies;
  const assistant_router = Router();

  // GET -> { messages, assistant_id, assistants: [{ id, label, description }] }
  assistant_router.get('/', function read_assistant(req, res) {
    res.json(get_assistant_state(database, chat_assistants, req.user_id));
  });

  // POST /messages { message, page?, utc_offset_minutes? } -> 201 { user_message,
  // assistant_message, client_actions: [{ type: "navigate", path }], data_changed }
  assistant_router.post('/messages', async function send_message(req, res) {
    const { field_errors, values } = validate_assistant_input(req.body);
    assert_no_field_errors(field_errors);
    res.status(HTTP_STATUS.created).json(await run_assistant_turn({ ...dependencies, ...values, user_id: req.user_id }));
  });

  // DELETE /messages -> 204, starts the conversation over
  assistant_router.delete('/messages', function clear_messages(req, res) {
    clear_assistant_messages(database, req.user_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  // PUT /settings { assistant_id } -> { assistant_id }
  assistant_router.put('/settings', function choose_assistant(req, res) {
    res.json(set_assistant_choice(database, chat_assistants, req.user_id, req.body?.assistant_id));
  });

  // POST /messages/:message_id/actions/:action_id/confirm -> { message, client_actions, data_changed }
  assistant_router.post('/messages/:message_id/actions/:action_id/confirm', async function confirm_action(req, res) {
    res.json(await confirm_assistant_action({ ...dependencies, ...req.params, user_id: req.user_id }));
  });

  // POST /messages/:message_id/actions/:action_id/cancel -> { message }
  assistant_router.post('/messages/:message_id/actions/:action_id/cancel', function cancel_action(req, res) {
    res.json(cancel_assistant_action({ database, ...req.params, user_id: req.user_id }));
  });

  return assistant_router;
}
