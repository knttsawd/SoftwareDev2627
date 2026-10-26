import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors } from '../services/http_error.js';
import { create_study_notes, list_notes } from '../services/note_service.js';
import { validate_notes_input } from '../services/study_validators.js';

// /api/skills/:skill_id/notes: AI study notes. Mounted inside the skill router (req.skill is set).
export function create_skill_note_router({ database, ai_provider }) {
  const note_router = Router();

  // GET -> [{ id, skill_id, topic, content (Markdown), created_at }], newest first
  note_router.get('/', function read_notes(req, res) {
    res.json(list_notes(database, req.user_id, req.skill.id));
  });

  // POST { topic } -> 201 note. Without resources a real AI uses general knowledge; practice mode answers 422.
  note_router.post('/', async function generate_notes(req, res) {
    const { field_errors, values } = validate_notes_input(req.body);
    assert_no_field_errors(field_errors);
    const note = await create_study_notes({
      database,
      ai_provider,
      user_id: req.user_id,
      skill_id: req.skill.id,
      topic: values.topic,
    });
    res.status(HTTP_STATUS.created).json(note);
  });

  return note_router;
}
