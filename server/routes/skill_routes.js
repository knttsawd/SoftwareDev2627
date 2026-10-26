import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { list_recent_results } from '../services/quiz_service.js';
import { create_skill, delete_skill, get_owned_skill, list_skills, update_skill } from '../services/skill_service.js';
import { validate_skill_input } from '../services/skill_validators.js';
import { create_skill_guided_lesson_router } from './guided_lesson_routes.js';
import { create_explain_router, create_glossary_router, create_learning_path_router } from './learning_routes.js';
import { create_skill_practice_router } from './practice_routes.js';
import { create_skill_reading_router } from './reading_routes.js';
import { create_skill_note_router } from './skill_note_routes.js';
import { create_skill_quiz_router } from './skill_quiz_routes.js';
import { create_skill_resource_router } from './skill_resource_routes.js';
import { create_skill_topic_router } from './skill_topic_routes.js';
import { create_skill_teach_router } from './teach_routes.js';

// /api/skills: the student's skills, plus each skill's resources, notes, quizzes, topics,
// results, AI student lessons, and the learning features (lessons, practice, reading, path, key terms).
// Mounted behind require_auth. Every /:skill_id path first runs load_owned_skill, which
// 404s for skills that don't exist or aren't the student's, and sets req.skill.
//
// dependencies: { database, uploads_path, ai_provider, resource_importer }
export function create_skill_router(dependencies) {
  const { database, uploads_path } = dependencies;
  const skill_router = Router();

  // GET /api/skills -> [{ id, name, color, created_at, resource_count, topic_count, ... }]
  skill_router.get('/', function read_skills(req, res) {
    res.json(list_skills(database, req.user_id));
  });

  // POST /api/skills { name, color? } -> 201 skill
  skill_router.post('/', function add_skill(req, res) {
    const { field_errors, values } = validate_skill_input(req.body);
    assert_no_field_errors(field_errors);
    res.status(HTTP_STATUS.created).json(create_skill(database, req.user_id, values));
  });

  skill_router.use('/:skill_id', function load_owned_skill(req, res, next) {
    req.skill = get_owned_skill(database, req.user_id, req.params.skill_id);
    next();
  });

  // PATCH /api/skills/:skill_id { name?, color? } -> updated skill
  skill_router.patch('/:skill_id', function edit_skill(req, res) {
    const { field_errors, values } = validate_skill_input(req.body, { is_partial: true });
    assert_no_field_errors(field_errors);
    res.json(update_skill(database, req.user_id, req.skill.id, values));
  });

  // DELETE /api/skills/:skill_id -> 204, with everything in the skill
  skill_router.delete('/:skill_id', async function remove_skill(req, res) {
    await delete_skill(database, uploads_path, req.user_id, req.skill.id);
    res.status(HTTP_STATUS.no_content).end();
  });

  // GET /api/skills/:skill_id/results -> the student's recent quiz results in this skill, newest first
  skill_router.get('/:skill_id/results', function read_recent_results(req, res) {
    res.json(list_recent_results(database, req.user_id, req.skill.id));
  });

  skill_router.use('/:skill_id/resources', create_skill_resource_router(dependencies));
  skill_router.use('/:skill_id/notes', create_skill_note_router(dependencies));
  skill_router.use('/:skill_id/quizzes', create_skill_quiz_router(dependencies));
  skill_router.use('/:skill_id/topics', create_skill_topic_router(dependencies));
  skill_router.use('/:skill_id/teach-sessions', create_skill_teach_router(dependencies));
  skill_router.use('/:skill_id/guided-lessons', create_skill_guided_lesson_router(dependencies));
  skill_router.use('/:skill_id/learning-path', create_learning_path_router(dependencies));
  skill_router.use('/:skill_id/practice-sets', create_skill_practice_router(dependencies));
  skill_router.use('/:skill_id/reading', create_skill_reading_router(dependencies));
  skill_router.use('/:skill_id/glossary', create_glossary_router(dependencies));
  skill_router.use('/:skill_id/explain', create_explain_router(dependencies));

  return skill_router;
}
