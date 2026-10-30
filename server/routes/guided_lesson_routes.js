import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import {
  advance_guided_lesson,
  answer_lesson_check,
  delete_guided_lesson,
  get_owned_guided_lesson,
  list_guided_lessons,
  reteach_current_step,
  start_guided_lesson,
  to_guided_lesson,
} from '../services/guided_lesson_service.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { validate_choice_index, validate_lesson_input } from '../services/learning_validators.js';
import { get_owned_skill } from '../services/skill_service.js';

// Guided lessons, described in services/guided_lesson_service.js. Every response that
// returns a lesson uses to_guided_lesson's shape.

// /api/skills/:skill_id/guided-lessons. Mounted inside the skill router (req.skill is set).
export function create_skill_guided_lesson_router({ database, ai_provider }) {
  const lesson_router = Router();

  // GET -> [lesson summary], newest first
  lesson_router.get('/', function read_skill_guided_lessons(req, res) {
    res.json(list_guided_lessons(database, req.user_id, req.skill.id));
  });

  // POST { topic_id? | topic, step_count? } -> 201 lesson, on its first step
  lesson_router.post('/', async function begin_guided_lesson(req, res) {
    const { field_errors, values } = validate_lesson_input(req.body);
    assert_no_field_errors(field_errors);
    const lesson = await start_guided_lesson({
      database,
      ai_provider,
      user_id: req.user_id,
      skill: req.skill,
      lesson_details: values,
    });
    res.status(HTTP_STATUS.created).json(lesson);
  });

  return lesson_router;
}

// /api/guided-lessons, behind require_auth.
export function create_guided_lesson_router({ database, ai_provider }) {
  const lesson_router = Router();

  // GET /:id -> lesson
  lesson_router.get('/:lesson_id', function read_guided_lesson(req, res) {
    res.json(to_guided_lesson(get_owned_guided_lesson(database, req.user_id, req.params.lesson_id)));
  });

  // POST /:id/answer { choice_index } -> lesson, with the current check's answer revealed
  lesson_router.post('/:lesson_id/answer', function answer_check(req, res) {
    const choice_error = validate_choice_index(req.body?.choice_index);
    assert_no_field_errors(choice_error ? { choice_index: choice_error } : {});
    const lesson_row = get_owned_guided_lesson(database, req.user_id, req.params.lesson_id);
    res.json(answer_lesson_check({ database, user_id: req.user_id, lesson_row, choice_index: req.body.choice_index }));
  });

  // POST /:id/reteach -> lesson, with the step explained again and a new check
  lesson_router.post('/:lesson_id/reteach', async function explain_step_again(req, res) {
    const lesson_row = get_owned_guided_lesson(database, req.user_id, req.params.lesson_id);
    const lesson = await reteach_current_step({
      database,
      ai_provider,
      user_id: req.user_id,
      skill: get_owned_skill(database, req.user_id, lesson_row.skill_id),
      lesson_row,
    });
    res.json(lesson);
  });

  // POST /:id/next -> lesson on its next step, or complete after the last
  lesson_router.post('/:lesson_id/next', function go_to_next_step(req, res) {
    const lesson_row = get_owned_guided_lesson(database, req.user_id, req.params.lesson_id);
    res.json(advance_guided_lesson({ database, user_id: req.user_id, lesson_row }));
  });

  // DELETE /:id -> 204
  lesson_router.delete('/:lesson_id', function remove_guided_lesson(req, res) {
    delete_guided_lesson(database, req.user_id, req.params.lesson_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return lesson_router;
}
