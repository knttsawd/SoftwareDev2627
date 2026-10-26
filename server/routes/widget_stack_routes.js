import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { create_stack, delete_stack, get_owned_stack, list_stacks, update_stack } from '../services/widget_stack_service.js';
import { validate_new_stack, validate_stack_updates } from '../services/widget_specs.js';

// /api/widget-stacks: smart stacks of widgets (services/widget_stack_service.js). Behind
// require_auth.
export function create_widget_stack_router({ database }) {
  const stack_router = Router();

  // GET -> [stack], oldest first: { id, widget_ids, view, active_widget_id, pinned_paths, layout }
  stack_router.get('/', function read_stacks(req, res) {
    res.json(list_stacks(database, req.user_id));
  });

  // POST { widget_ids, view?, pinned_paths?, layout? } -> 201 the new stack
  stack_router.post('/', function make_stack(req, res) {
    const { field_errors, values } = validate_new_stack(req.body);
    assert_no_field_errors(field_errors);
    res.status(HTTP_STATUS.created).json(create_stack(database, req.user_id, values));
  });

  // PATCH /:id { widget_ids?, view?, active_widget_id?, pinned_paths?, layout? } -> { stack },
  // where stack is null when one widget was left and the stack was taken apart
  stack_router.patch('/:stack_id', function edit_stack(req, res) {
    const stack = get_owned_stack(database, req.user_id, req.params.stack_id);
    const { field_errors, values } = validate_stack_updates(req.body, stack.layout);
    assert_no_field_errors(field_errors);
    res.json({ stack: update_stack(database, req.user_id, stack.id, values) });
  });

  // DELETE /:id -> 204: the stack is taken apart; its widgets are kept
  stack_router.delete('/:stack_id', function take_stack_apart(req, res) {
    delete_stack(database, req.user_id, req.params.stack_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return stack_router;
}
