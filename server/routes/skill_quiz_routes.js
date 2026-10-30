import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { create_practice_quiz, list_quizzes } from '../services/quiz_service.js';
import { validate_quiz_input } from '../services/study_validators.js';

// /api/skills/:skill_id/quizzes: AI practice quizzes. Mounted inside the skill router
// (req.skill is set).
export function create_skill_quiz_router({ database, ai_provider }) {
  const quiz_router = Router();

  // GET -> [{ id, skill_id, topic_id, scope, resource_id, topic, created_at, question_count }], newest first
  quiz_router.get('/', function read_quizzes(req, res) {
    res.json(list_quizzes(database, req.user_id, req.skill.id));
  });

  // POST { scope?, topic?, topic_id?, resource_id?, question_count? } -> 201 quiz without answers.
  // scope "topic" (the default) quizzes on a skill-map topic (topic_id) or anything typed (topic),
  // "resource" on one resource (resource_id), and "skill" on the whole skill. Works without
  // resources when a real AI is on (it uses general knowledge); practice mode answers 422.
  quiz_router.post('/', async function generate_quiz(req, res) {
    const { field_errors, values } = validate_quiz_input(req.body);
    assert_no_field_errors(field_errors);
    const quiz = await create_practice_quiz({
      database,
      ai_provider,
      user_id: req.user_id,
      skill: req.skill,
      quiz_details: values,
    });
    res.status(HTTP_STATUS.created).json(quiz);
  });

  return quiz_router;
}
