import { Router } from 'express';
import { HTTP_STATUS, TEACH_QUIZ_QUESTION_COUNT } from '../config/constants.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { get_owned_quiz } from '../services/quiz_service.js';
import { get_owned_skill } from '../services/skill_service.js';
import {
  validate_quiz_answers,
  validate_teach_message,
  validate_teach_question_count,
  validate_teach_session_input,
} from '../services/study_validators.js';
import {
  add_teaching_message,
  delete_teach_session,
  get_owned_teach_session,
  list_teach_sessions,
  start_lesson_quiz,
  start_teach_session,
  submit_lesson_answers,
  to_teach_session,
} from '../services/teach_service.js';

// "Teach the AI student" lessons. A teach session is described in services/teach_service.js;
// every response that returns one uses to_teach_session's shape.

// /api/skills/:skill_id/teach-sessions. Mounted inside the skill router (req.skill is set).
export function create_skill_teach_router({ database }) {
  const teach_router = Router();

  // GET -> [lesson summary], newest first
  teach_router.get('/', function read_skill_lessons(req, res) {
    res.json(list_teach_sessions(database, req.user_id, { skill_id: req.skill.id }));
  });

  // POST { topic_id? | topic } -> 201 teach session, opened by the AI student's greeting
  teach_router.post('/', function start_lesson(req, res) {
    const { field_errors, values } = validate_teach_session_input(req.body);
    assert_no_field_errors(field_errors);
    res.status(HTTP_STATUS.created).json(start_teach_session(database, req.user_id, req.skill, values));
  });

  return teach_router;
}

// /api/teach-sessions, behind require_auth.
export function create_teach_session_router({ database, ai_provider }) {
  const teach_router = Router();

  // GET -> [lesson summary] across every skill, newest first (for the Quiz page)
  teach_router.get('/', function read_recent_lessons(req, res) {
    res.json(list_teach_sessions(database, req.user_id));
  });

  // GET /:id -> teach session
  teach_router.get('/:session_id', function read_lesson(req, res) {
    res.json(to_teach_session(database, get_owned_teach_session(database, req.user_id, req.params.session_id)));
  });

  // POST /:id/messages { message } -> teach session with the explanation and the AI student's reply
  teach_router.post('/:session_id/messages', async function explain(req, res) {
    const message_error = validate_teach_message(req.body?.message);
    assert_no_field_errors(message_error ? { message: message_error } : {});
    const session_row = get_owned_teach_session(database, req.user_id, req.params.session_id);
    const teach_session = await add_teaching_message({
      database,
      ai_provider,
      user_id: req.user_id,
      session_row,
      message: req.body.message.trim(),
    });
    res.json(teach_session);
  });

  // POST /:id/quiz { question_count? } -> teach session with its quiz (no answers). The AI
  // student answers it here, but its answers stay hidden until the student's are in.
  teach_router.post('/:session_id/quiz', async function finish_lesson(req, res) {
    const count_error = validate_teach_question_count(req.body?.question_count);
    assert_no_field_errors(count_error ? { question_count: count_error } : {});
    const session_row = get_owned_teach_session(database, req.user_id, req.params.session_id);
    const teach_session = await start_lesson_quiz({
      database,
      ai_provider,
      user_id: req.user_id,
      skill: get_owned_skill(database, req.user_id, session_row.skill_id),
      session_row,
      question_count: req.body?.question_count ?? TEACH_QUIZ_QUESTION_COUNT.default,
    });
    res.json(teach_session);
  });

  // POST /:id/results { answers } -> 201 { teach_session (with results), topic (updated map topic or null) }
  teach_router.post('/:session_id/results', function grade_lesson(req, res) {
    const session_row = get_owned_teach_session(database, req.user_id, req.params.session_id);
    if (session_row.quiz_id) {
      const questions = JSON.parse(get_owned_quiz(database, req.user_id, session_row.quiz_id).questions);
      const answers_error = validate_quiz_answers(req.body?.answers, questions);
      assert_no_field_errors(answers_error ? { answers: answers_error } : {});
    }
    res
      .status(HTTP_STATUS.created)
      .json(submit_lesson_answers({ database, user_id: req.user_id, session_row, answers: req.body.answers }));
  });

  // DELETE /:id -> 204, with its quiz and results
  teach_router.delete('/:session_id', function remove_lesson(req, res) {
    delete_teach_session(database, req.user_id, req.params.session_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return teach_router;
}
