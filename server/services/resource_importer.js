import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { HTTP_STATUS } from '../config/constants.js';
import { NO_TEXT_MESSAGES, SUPPORTED_EXTENSIONS } from '../config/resource_types.js';
import { fetch_article } from './extraction/article_extractor.js';
import { extract_file_text, get_file_extension, get_file_resource_type } from './extraction/file_extractor.js';
import { assert_enough_text, limit_text_length, normalize_extracted_text } from './extraction/text_cleanup.js';
import { fetch_youtube_title, fetch_youtube_transcript, get_youtube_video_id } from './extraction/youtube_extractor.js';
import { create_http_error } from './http_error.js';
import { insert_resource } from './resource_service.js';
import { save_user_file } from './storage_service.js';

// Cleans raw extracted text, refuses it if it is (nearly) empty, and caps its length.
// Returns { text, is_truncated }.
export function prepare_extracted_text(raw_text, resource_type) {
  const normalized_text = normalize_extracted_text(raw_text);
  assert_enough_text(normalized_text, NO_TEXT_MESSAGES[resource_type]);
  return limit_text_length(normalized_text);
}

// Turns "Week 3 notes.pdf" into "Week 3 notes" for a default title.
export function get_title_from_file_name(file_name) {
  return path.basename(file_name, path.extname(file_name));
}

// The three ways to add a resource to a skill. Each one extracts the text first, so
// nothing is saved when a file or link can't be read. Each takes an optional topic_id
// (already checked to be in the skill) and returns the saved resource summary plus
// is_truncated.
//
// transcriber is { transcribe(file_buffer, file_name) } from services/ai/transcribers.js.
export function create_resource_importer({ database, uploads_path, transcriber }) {
  async function import_file({ user_id, skill_id, topic_id, uploaded_file, title }) {
    const resource_type = get_file_resource_type(uploaded_file.originalname);
    if (!resource_type) {
      throw create_http_error(
        HTTP_STATUS.bad_request,
        `That file type is not supported. Upload one of: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      );
    }

    const raw_text = await extract_file_text({
      resource_type,
      file_buffer: uploaded_file.buffer,
      file_name: uploaded_file.originalname,
      transcribe: transcriber.transcribe,
    });
    const { text, is_truncated } = prepare_extracted_text(raw_text, resource_type);

    const resource_id = randomUUID();
    const file_path = await save_user_file(
      uploads_path,
      user_id,
      `${resource_id}${get_file_extension(uploaded_file.originalname)}`,
      uploaded_file.buffer,
    );
    const resource = insert_resource(database, {
      id: resource_id,
      user_id,
      skill_id,
      topic_id,
      title: title ?? get_title_from_file_name(uploaded_file.originalname),
      resource_type,
      file_path,
      extracted_text: text,
    });
    return { ...resource, is_truncated };
  }

  // YouTube links use the video's captions; every other link is read as an article.
  async function import_link({ user_id, skill_id, topic_id, url, title }) {
    const video_id = get_youtube_video_id(url);
    const resource_type = video_id ? 'youtube' : 'article';
    const fetched_resource = video_id
      ? { text: await fetch_youtube_transcript(video_id), title: title ?? (await fetch_youtube_title(video_id)) }
      : await fetch_article(url);

    const { text, is_truncated } = prepare_extracted_text(fetched_resource.text, resource_type);
    const resource = insert_resource(database, {
      id: randomUUID(),
      user_id,
      skill_id,
      topic_id,
      title: title ?? (fetched_resource.title || url),
      resource_type,
      source_url: url,
      extracted_text: text,
    });
    return { ...resource, is_truncated };
  }

  function import_typed_note({ user_id, skill_id, topic_id, title, text: note_text }) {
    const { text, is_truncated } = prepare_extracted_text(note_text, 'note');
    const resource = insert_resource(database, {
      id: randomUUID(),
      user_id,
      skill_id,
      topic_id,
      title,
      resource_type: 'note',
      extracted_text: text,
    });
    return { ...resource, is_truncated };
  }

  return { import_file, import_link, import_typed_note };
}
