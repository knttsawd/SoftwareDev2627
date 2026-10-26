import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { create_event, delete_event, get_owned_event, list_events, update_event } from '../services/event_service.js';
import { validate_event_input, validate_event_range } from '../services/event_validators.js';
import { assert_no_field_errors, create_http_error } from '../services/http_error.js';

// /api/events: the study schedule. Times are ISO date-times; the browser converts them to
// and from the student's own time zone. Each event carries skill_name and skill_color.
export function create_event_router({ database }) {
  const event_router = Router();

  // GET ?from=<iso>&to=<iso> -> events overlapping that range, earliest first (at most 62 days)
  event_router.get('/', function read_events(req, res) {
    const { error, from, to } = validate_event_range(req.query);
    if (error) throw create_http_error(HTTP_STATUS.bad_request, error);
    res.json(list_events(database, req.user_id, from, to));
  });

  // POST { title, starts_at, ends_at, details?, skill_id? } -> 201 event
  event_router.post('/', function add_event(req, res) {
    const { field_errors, values } = validate_event_input(req.body);
    assert_no_field_errors(field_errors);
    res.status(HTTP_STATUS.created).json(create_event(database, req.user_id, values));
  });

  // GET /:event_id -> one event (the work block page uses this)
  event_router.get('/:event_id', function read_event(req, res) {
    res.json(get_owned_event(database, req.user_id, req.params.event_id));
  });

  // PATCH /:event_id { any of title, details, skill_id, starts_at, ends_at } -> updated event
  event_router.patch('/:event_id', function edit_event(req, res) {
    const current_event = get_owned_event(database, req.user_id, req.params.event_id);
    const { field_errors, values } = validate_event_input(req.body, { is_partial: true, current_event });
    assert_no_field_errors(field_errors);
    res.json(update_event(database, req.user_id, req.params.event_id, values));
  });

  // DELETE /:event_id -> 204
  event_router.delete('/:event_id', function remove_event(req, res) {
    delete_event(database, req.user_id, req.params.event_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return event_router;
}
