import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { validate_optional_id } from '../services/study_validators.js';
import {
  finish_work_block,
  get_active_work_block,
  start_work_block,
  validate_activity,
  validate_planned_minutes,
} from '../services/work_block_service.js';

// Collects field errors for a work block request; fields not in field_checks are ignored.
function check_work_block_fields(field_checks) {
  return Object.fromEntries(Object.entries(field_checks).filter(([, error_message]) => error_message));
}

// /api/work-blocks: focus timer sessions. The timer itself runs in the browser from
// started_at, so it survives page reloads.
export function create_work_block_router({ database }) {
  const work_block_router = Router();

  // POST { activity: "quiz" | "assignment", event_id?, skill_id?, planned_minutes? } -> 201 work block
  work_block_router.post('/', function begin_work_block(req, res) {
    assert_no_field_errors(
      check_work_block_fields({
        activity: validate_activity(req.body?.activity),
        event_id: validate_optional_id(req.body?.event_id),
        skill_id: validate_optional_id(req.body?.skill_id),
        planned_minutes: validate_planned_minutes(req.body?.planned_minutes),
      }),
    );
    res.status(HTTP_STATUS.created).json(start_work_block(database, req.user_id, req.body));
  });

  // GET /active -> { work_block } (null when nothing is running)
  work_block_router.get('/active', function read_active_work_block(req, res) {
    res.json({ work_block: get_active_work_block(database, req.user_id) });
  });

  // POST /:work_block_id/finish { completed_minutes?, activity? } -> the ended work block
  work_block_router.post('/:work_block_id/finish', function end_work_block(req, res) {
    const completed_minutes = req.body?.completed_minutes;
    assert_no_field_errors(
      check_work_block_fields({
        completed_minutes:
          completed_minutes === undefined || (Number.isInteger(completed_minutes) && completed_minutes >= 0)
            ? null
            : 'Minutes must be a whole number',
        activity: req.body?.activity === undefined ? null : validate_activity(req.body.activity),
      }),
    );
    res.json(finish_work_block(database, req.user_id, req.params.work_block_id, req.body ?? {}));
  });

  return work_block_router;
}
