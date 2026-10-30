import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { explain_another_way } from '../services/explain_service.js';
import {
  add_glossary_term,
  delete_glossary_term,
  generate_glossary_terms,
  list_glossary_terms,
} from '../services/glossary_service.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { build_learning_path, get_learning_path } from '../services/learning_path_service.js';
import { validate_explain_input, validate_glossary_term_input } from '../services/learning_validators.js';

// The skill-wide learning routes: the learning path, key terms and "explain another way".
// Each router is mounted inside the skill router, so req.skill is set.

// /api/skills/:skill_id/learning-path
export function create_learning_path_router({ database, ai_provider }) {
  const path_router = Router();

  // GET -> { has_path, created_at, steps, new_topic_count, topic_count } (see get_learning_path)
  path_router.get('/', function read_learning_path(req, res) {
    res.json(get_learning_path(database, req.user_id, req.skill));
  });

  // POST -> the new path, ordered by the AI (finding topics first if the skill has none)
  path_router.post('/', async function make_learning_path(req, res) {
    res.json(await build_learning_path({ database, ai_provider, user_id: req.user_id, skill: req.skill }));
  });

  return path_router;
}

// /api/skills/:skill_id/glossary
export function create_glossary_router({ database, ai_provider }) {
  const glossary_router = Router();

  // GET -> [term], alphabetical
  glossary_router.get('/', function read_glossary(req, res) {
    res.json(list_glossary_terms(database, req.user_id, req.skill.id));
  });

  // POST { term, definition, topic_id? } -> 201 term
  glossary_router.post('/', function add_term(req, res) {
    const { field_errors, values } = validate_glossary_term_input(req.body);
    assert_no_field_errors(field_errors);
    res.status(HTTP_STATUS.created).json(add_glossary_term(database, req.user_id, req.skill.id, values));
  });

  // POST /generate -> { added_count, terms }
  glossary_router.post('/generate', async function find_key_terms(req, res) {
    res.json(await generate_glossary_terms({ database, ai_provider, user_id: req.user_id, skill: req.skill }));
  });

  // DELETE /:term_id -> 204
  glossary_router.delete('/:term_id', function remove_term(req, res) {
    delete_glossary_term(database, req.user_id, req.skill.id, req.params.term_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return glossary_router;
}

// /api/skills/:skill_id/explain
export function create_explain_router({ database, ai_provider }) {
  const explain_router = Router();

  // POST { text, style, topic_id? } -> { explanation_markdown }
  explain_router.post('/', async function explain_differently(req, res) {
    const { field_errors, values } = validate_explain_input(req.body);
    assert_no_field_errors(field_errors);
    const explanation = await explain_another_way({
      database,
      ai_provider,
      user_id: req.user_id,
      skill: req.skill,
      explain_details: values,
    });
    res.json(explanation);
  });

  return explain_router;
}
