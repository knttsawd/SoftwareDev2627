import { Router } from 'express';
import { assert_no_field_errors } from '../services/http_error.js';
import { validate_passage } from '../services/learning_validators.js';
import {
  explain_reading_passage,
  get_reading_overview,
  get_reading_section,
  guide_reading_section,
  list_reading_resources,
  save_reading_position,
} from '../services/reading_service.js';

// Active reading, described in services/reading_service.js. :section_index is 0-based.

// /api/skills/:skill_id/reading. Mounted inside the skill router (req.skill is set).
export function create_skill_reading_router({ database }) {
  const reading_router = Router();

  // GET -> [{ resource_id, title, resource_type, topic_id, section_count, position }]
  reading_router.get('/', function read_reading_list(req, res) {
    res.json(list_reading_resources(database, req.user_id, req.skill.id));
  });

  return reading_router;
}

// /api/resources/:resource_id/reading. Mounted inside the resource router.
export function create_resource_reading_router({ database, ai_provider }) {
  const reading_router = Router({ mergeParams: true });

  // GET -> { resource, sections: [{ index, title, character_count, has_guide }], position }
  reading_router.get('/', function read_reading_overview(req, res) {
    res.json(get_reading_overview(database, req.user_id, req.params.resource_id));
  });

  // GET /sections/:section_index -> { index, title, text, guide | null }
  reading_router.get('/sections/:section_index', function read_section(req, res) {
    res.json(get_reading_section(database, req.user_id, req.params.resource_id, Number(req.params.section_index)));
  });

  // POST /sections/:section_index/guide -> the section with its guide (made by the AI the first time)
  reading_router.post('/sections/:section_index/guide', async function guide_section(req, res) {
    const section = await guide_reading_section({
      database,
      ai_provider,
      user_id: req.user_id,
      resource_id: req.params.resource_id,
      section_index: Number(req.params.section_index),
    });
    res.json(section);
  });

  // PUT /position { section_index } -> { position }
  reading_router.put('/position', function remember_position(req, res) {
    res.json(save_reading_position(database, req.user_id, req.params.resource_id, req.body?.section_index));
  });

  // POST /explain { passage, section_index } -> { explanation_markdown }
  reading_router.post('/explain', async function explain_passage(req, res) {
    const passage_error = validate_passage(req.body?.passage);
    assert_no_field_errors(passage_error ? { passage: passage_error } : {});
    const explanation = await explain_reading_passage({
      database,
      ai_provider,
      user_id: req.user_id,
      resource_id: req.params.resource_id,
      section_index: req.body.section_index,
      passage: req.body.passage.trim(),
    });
    res.json(explanation);
  });

  return reading_router;
}
