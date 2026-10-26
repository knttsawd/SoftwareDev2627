import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { receive_upload } from '../middleware/receive_upload.js';
import { assert_no_field_errors, create_http_error } from '../services/http_error.js';
import { list_resources } from '../services/resource_service.js';
import { resolve_resource_topic_id } from '../services/topic_resource_service.js';
import {
  validate_file_upload_input,
  validate_link_input,
  validate_typed_note_input,
} from '../services/resource_validators.js';

// /api/skills/:skill_id/resources. Mounted inside the skill router, so req.skill is the
// student's own skill. Every add route takes an optional topic_id to file the resource
// under a skill-map topic, and answers 201 with the resource summary plus is_truncated
// (true when the text was too long and only the start was kept).
export function create_skill_resource_router({ database, resource_importer }) {
  const resource_router = Router();

  // GET -> [{ id, topic_id, title, resource_type, source_url, status, created_at, character_count }]
  resource_router.get('/', function read_resources(req, res) {
    res.json(list_resources(database, req.user_id, req.skill.id));
  });

  // POST /files (multipart: file, title?, topic_id?) -> PDF, text, Markdown, audio or video
  resource_router.post('/files', receive_upload, async function add_file(req, res) {
    if (!req.file) throw create_http_error(HTTP_STATUS.bad_request, 'Choose a file to upload');
    const { field_errors, values } = validate_file_upload_input(req.body);
    assert_no_field_errors(field_errors);
    const resource = await resource_importer.import_file({
      user_id: req.user_id,
      skill_id: req.skill.id,
      topic_id: resolve_resource_topic_id(database, req.user_id, req.skill.id, values.topic_id),
      uploaded_file: req.file,
      title: values.title,
    });
    res.status(HTTP_STATUS.created).json(resource);
  });

  // POST /links { url, title?, topic_id? } -> a YouTube video (captions) or an article
  resource_router.post('/links', async function add_link(req, res) {
    const { field_errors, values } = validate_link_input(req.body);
    assert_no_field_errors(field_errors);
    const resource = await resource_importer.import_link({
      user_id: req.user_id,
      skill_id: req.skill.id,
      topic_id: resolve_resource_topic_id(database, req.user_id, req.skill.id, values.topic_id),
      url: values.url,
      title: values.title,
    });
    res.status(HTTP_STATUS.created).json(resource);
  });

  // POST /text { title, text, topic_id? } -> notes typed or pasted into the app
  resource_router.post('/text', function add_typed_note(req, res) {
    const { field_errors, values } = validate_typed_note_input(req.body);
    assert_no_field_errors(field_errors);
    const resource = resource_importer.import_typed_note({
      user_id: req.user_id,
      skill_id: req.skill.id,
      topic_id: resolve_resource_topic_id(database, req.user_id, req.skill.id, values.topic_id),
      title: values.title,
      text: values.text,
    });
    res.status(HTTP_STATUS.created).json(resource);
  });

  return resource_router;
}
