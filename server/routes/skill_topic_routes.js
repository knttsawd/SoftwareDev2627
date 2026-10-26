import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { validate_topic_input } from '../services/study_validators.js';
import { add_topic, generate_skill_topics, get_topic_map } from '../services/topic_service.js';

// /api/skills/:skill_id/topics: the skill map. Mounted inside the skill router (req.skill is set).
export function create_skill_topic_router({ database, ai_provider }) {
  const topic_router = Router();

  // GET -> { topics: [topic with mastery_level], suggestions: [{ topic_id, topic, mastery_level, reason }] }
  topic_router.get('/', function read_topic_map(req, res) {
    res.json(get_topic_map(database, req.user_id, req.skill.id));
  });

  // POST { topic, parent_topic_id? } -> 201 topic
  topic_router.post('/', function add_skill_topic(req, res) {
    const { field_errors, values } = validate_topic_input(req.body);
    assert_no_field_errors(field_errors);
    res.status(HTTP_STATUS.created).json(add_topic(database, req.user_id, req.skill.id, values));
  });

  // POST /generate -> the updated topic map, after the AI adds topics found in the resources
  // (or, for a skill with none, the topics a course on it usually covers)
  topic_router.post('/generate', async function find_topics(req, res) {
    res.json(await generate_skill_topics({ database, ai_provider, user_id: req.user_id, skill: req.skill }));
  });

  return topic_router;
}
