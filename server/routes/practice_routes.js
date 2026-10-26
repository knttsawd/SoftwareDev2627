import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { validate_practice_answer, validate_practice_input } from '../services/learning_validators.js';
import {
  check_practice_answer,
  create_practice_set,
  delete_practice_set,
  get_owned_practice_set,
  list_practice_sets,
  reveal_hint,
  reveal_solution,
  to_practice_set,
} from '../services/practice_service.js';

// Practice with hints, described in services/practice_service.js. Every response that
// returns a practice set uses to_practice_set's shape. :problem_index is 0-based.

// /api/skills/:skill_id/practice-sets. Mounted inside the skill router (req.skill is set).
export function create_skill_practice_router({ database, ai_provider }) {
  const practice_router = Router();

  // GET -> [practice set summary], newest first
  practice_router.get('/', function read_skill_practice_sets(req, res) {
    res.json(list_practice_sets(database, req.user_id, req.skill.id));
  });

  // POST { topic_id? | topic, problem_count? } -> 201 practice set
  practice_router.post('/', async function make_practice_set(req, res) {
    const { field_errors, values } = validate_practice_input(req.body);
    assert_no_field_errors(field_errors);
    const practice_set = await create_practice_set({
      database,
      ai_provider,
      user_id: req.user_id,
      skill: req.skill,
      practice_details: values,
    });
    res.status(HTTP_STATUS.created).json(practice_set);
  });

  return practice_router;
}

// /api/practice-sets, behind require_auth.
export function create_practice_set_router({ database, ai_provider }) {
  const practice_router = Router();

  // The practice set and problem the request is about.
  function read_target(req) {
    return {
      database,
      user_id: req.user_id,
      practice_row: get_owned_practice_set(database, req.user_id, req.params.practice_id),
      problem_index: Number(req.params.problem_index),
    };
  }

  // GET /:id -> practice set
  practice_router.get('/:practice_id', function read_practice_set(req, res) {
    res.json(to_practice_set(get_owned_practice_set(database, req.user_id, req.params.practice_id)));
  });

  // POST /:id/problems/:problem_index/hint -> practice set with one more hint shown
  practice_router.post('/:practice_id/problems/:problem_index/hint', function show_hint(req, res) {
    res.json(reveal_hint(read_target(req)));
  });

  // POST /:id/problems/:problem_index/solution -> practice set with that problem's solution shown
  practice_router.post('/:practice_id/problems/:problem_index/solution', function show_solution(req, res) {
    res.json(reveal_solution(read_target(req)));
  });

  // POST /:id/problems/:problem_index/check { answer } -> { practice_set, attempt: { answer, is_correct, feedback } }
  practice_router.post('/:practice_id/problems/:problem_index/check', async function check_answer(req, res) {
    const answer_error = validate_practice_answer(req.body?.answer);
    assert_no_field_errors(answer_error ? { answer: answer_error } : {});
    res.json(await check_practice_answer({ ...read_target(req), ai_provider, answer: req.body.answer.trim() }));
  });

  // DELETE /:id -> 204
  practice_router.delete('/:practice_id', function remove_practice_set(req, res) {
    delete_practice_set(database, req.user_id, req.params.practice_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return practice_router;
}
