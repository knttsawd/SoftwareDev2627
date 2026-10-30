import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors, create_http_error } from '../services/http_error.js';
import { delete_note } from '../services/note_service.js';
import {
  check_quiz_answer,
  delete_quiz,
  get_owned_quiz,
  submit_quiz_answers,
  to_public_quiz,
} from '../services/quiz_service.js';
import { delete_resource, get_owned_resource } from '../services/resource_service.js';
import {
  validate_answer_check,
  validate_quiz_answers,
  validate_resource_topic_input,
  validate_topic_update_input,
} from '../services/study_validators.js';
import { generate_subtopics, move_resource_to_topic } from '../services/topic_resource_service.js';
import { delete_topic, update_topic } from '../services/topic_service.js';
import { create_resource_reading_router } from './reading_routes.js';

// Routes for single items addressed by their own id, all behind require_auth.
// Each lookup is limited to the student's own items; anything else is a 404.

// /api/resources/:resource_id
export function create_resource_router({ database, uploads_path, ai_provider }) {
  const resource_router = Router();

  // Active reading: /api/resources/:resource_id/reading/... (routes/reading_routes.js)
  resource_router.use('/:resource_id/reading', create_resource_reading_router({ database, ai_provider }));

  // GET -> the resource with its full extracted_text
  resource_router.get('/:resource_id', function read_resource(req, res) {
    // file_path is a server-side detail, so it is left out of the response.
    const { file_path, ...resource } = get_owned_resource(database, req.user_id, req.params.resource_id);
    res.json(resource);
  });

  // PATCH { topic_id } -> the updated summary. Files the resource under a topic in its
  // skill, or takes it out of its topic with null.
  resource_router.patch('/:resource_id', function file_resource_under_topic(req, res) {
    const { field_errors, values } = validate_resource_topic_input(req.body);
    assert_no_field_errors(field_errors);
    res.json(move_resource_to_topic(database, req.user_id, req.params.resource_id, values.topic_id));
  });

  // DELETE -> 204, also removes the uploaded file
  resource_router.delete('/:resource_id', async function remove_resource(req, res) {
    await delete_resource(database, uploads_path, req.user_id, req.params.resource_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return resource_router;
}

// /api/notes/:note_id
export function create_note_router({ database }) {
  const note_router = Router();

  note_router.delete('/:note_id', function remove_note(req, res) {
    delete_note(database, req.user_id, req.params.note_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return note_router;
}

// /api/topics/:topic_id
export function create_topic_router({ database, ai_provider }) {
  const topic_router = Router();

  // PATCH { topic?, parent_topic_id? } -> the updated topic. Renames it, or moves it (with
  // everything under it) under another topic, or to the top level with null.
  topic_router.patch('/:topic_id', function edit_topic(req, res) {
    const { field_errors, values } = validate_topic_update_input(req.body);
    assert_no_field_errors(field_errors);
    res.json(update_topic(database, req.user_id, req.params.topic_id, values));
  });

  // POST /generate -> the updated topic map, after the AI adds subtopics under this topic
  topic_router.post('/:topic_id/generate', async function find_subtopics(req, res) {
    res.json(await generate_subtopics({ database, ai_provider, user_id: req.user_id, topic_id: req.params.topic_id }));
  });

  // DELETE -> 204. Like deleting a folder but keeping what's in it: subtopics and resources
  // move up to the topic's parent. Its quizzes and notes are kept.
  topic_router.delete('/:topic_id', function remove_topic(req, res) {
    delete_topic(database, req.user_id, req.params.topic_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return topic_router;
}

// /api/quizzes/:quiz_id
export function create_quiz_router({ database }) {
  const quiz_router = Router();

  // GET -> the quiz without answers
  quiz_router.get('/:quiz_id', function read_quiz(req, res) {
    res.json(to_public_quiz(get_owned_quiz(database, req.user_id, req.params.quiz_id)));
  });

  // POST /check { question_index, answer_index } -> { is_correct, correct_index, explanation }
  // Instant feedback for one question; nothing is saved.
  quiz_router.post('/:quiz_id/check', function check_answer(req, res) {
    const quiz_row = get_owned_quiz(database, req.user_id, req.params.quiz_id);
    const check_error = validate_answer_check(req.body, JSON.parse(quiz_row.questions));
    if (check_error) throw create_http_error(HTTP_STATUS.bad_request, check_error);
    res.json(check_quiz_answer(quiz_row, req.body.question_index, req.body.answer_index));
  });

  // POST /results { answers: [choice index or null] } -> 201 { result, question_results, topic }
  quiz_router.post('/:quiz_id/results', function grade_quiz(req, res) {
    const quiz_row = get_owned_quiz(database, req.user_id, req.params.quiz_id);
    const answers_error = validate_quiz_answers(req.body?.answers, JSON.parse(quiz_row.questions));
    assert_no_field_errors(answers_error ? { answers: answers_error } : {});
    res.status(HTTP_STATUS.created).json(submit_quiz_answers(database, req.user_id, quiz_row, req.body.answers));
  });

  quiz_router.delete('/:quiz_id', function remove_quiz(req, res) {
    delete_quiz(database, req.user_id, req.params.quiz_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return quiz_router;
}
