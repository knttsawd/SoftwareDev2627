import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { to_upload_error } from '../middleware/receive_upload.js';
import {
  create_resource_importer,
  get_title_from_file_name,
  prepare_extracted_text,
} from '../services/resource_importer.js';
import {
  delete_resource,
  get_owned_resource,
  get_skill_overview_text,
  insert_resource,
  list_resources,
  list_skill_sources,
} from '../services/resource_service.js';
import {
  clean_title,
  validate_file_upload_input,
  validate_link_input,
  validate_resource_title,
  validate_resource_url,
  validate_typed_note_input,
  validate_typed_note_text,
} from '../services/resource_validators.js';
import { build_test_pdf } from './helpers/build_test_pdf.js';
import { create_test_account } from './helpers/test_accounts.js';
import { create_spied_ai, create_student_with_skill, insert_test_resource, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';

vi.mock('../services/extraction/article_extractor.js', () => ({ fetch_article: vi.fn() }));
vi.mock('../services/extraction/youtube_extractor.js', async (import_original) => ({
  ...(await import_original()),
  fetch_youtube_transcript: vi.fn(),
  fetch_youtube_title: vi.fn(),
}));

const { fetch_article } = await import('../services/extraction/article_extractor.js');
const { fetch_youtube_title, fetch_youtube_transcript } = await import('../services/extraction/youtube_extractor.js');

let database;
let uploads_path;
let user_id;
let skill;

beforeEach(async () => {
  vi.clearAllMocks();
  database = open_database(IN_MEMORY_DATABASE);
  uploads_path = mkdtempSync(path.join(tmpdir(), 'studyapp-uploads-'));
  ({ user_id, skill } = await create_student_with_skill(database));
});

afterEach(() => {
  rmSync(uploads_path, { recursive: true, force: true });
});

describe('resource validators', () => {
  it('make titles optional unless required, with a length limit', () => {
    expect(validate_resource_title(undefined)).toBeNull();
    expect(validate_resource_title(' ', { is_required: true })).toBe('Title is required');
    expect(validate_resource_title(42)).toBe('Title must be text');
    expect(validate_resource_title('x'.repeat(201))).toMatch('at most 200');
    expect(clean_title('  Week 1 ')).toBe('Week 1');
    expect(clean_title(' ')).toBeNull();
  });

  it('check links and typed notes', () => {
    expect(validate_resource_url('')).toBe('Link is required');
    expect(validate_resource_url(`https://example.com/${'x'.repeat(2048)}`)).toBe('That link is too long');
    expect(validate_typed_note_text(' ')).toBe('Note text is required');
    expect(validate_typed_note_text('x'.repeat(100_001))).toMatch('at most');
  });

  it('build values and field errors for each way of adding a resource', () => {
    expect(validate_file_upload_input({ title: ' Slides ', topic_id: '' })).toEqual({
      field_errors: {},
      values: { title: 'Slides', topic_id: null },
    });
    expect(validate_link_input({ url: ' https://example.com ', topic_id: 'topic-1' })).toEqual({
      field_errors: {},
      values: { url: 'https://example.com', title: null, topic_id: 'topic-1' },
    });
    expect(validate_typed_note_input({ title: 'A', text: 'notes', topic_id: 7 }).field_errors).toEqual({
      topic_id: 'Choose a topic from the list',
    });
    expect(validate_typed_note_input({ text: 'notes' }).field_errors).toEqual({ title: 'Title is required' });
  });
});

describe('resource service', () => {
  it('inserts, lists (without full text) and reads resources', () => {
    const summary = insert_resource(database, {
      id: 'resource-1',
      user_id,
      skill_id: skill.id,
      title: 'Chapter 1',
      resource_type: 'note',
      extracted_text: 'Some study text here.',
    });

    expect(summary).toMatchObject({ id: 'resource-1', status: 'ready', character_count: 21 });
    expect(summary).not.toHaveProperty('extracted_text');
    expect(list_resources(database, user_id, skill.id)).toHaveLength(1);
    expect(get_owned_resource(database, user_id, 'resource-1').extracted_text).toBe('Some study text here.');
  });

  it("hides other students' resources", async () => {
    const { id: other_user_id } = await create_test_account(database, { username: 'other', email: 'o@example.com' });
    const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id });

    expect(() => get_owned_resource(database, other_user_id, resource_id)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('deletes a resource', async () => {
    const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id });

    await delete_resource(database, uploads_path, user_id, resource_id);

    expect(list_resources(database, user_id, skill.id)).toEqual([]);
  });

  it('collects source text for the AI, which is empty when there are no resources', () => {
    expect(get_skill_overview_text(database, user_id, skill.id)).toBe('');

    insert_test_resource(database, { user_id, skill_id: skill.id, title: 'Plants' });

    expect(list_skill_sources(database, user_id, skill.id)).toEqual([
      expect.objectContaining({ title: 'Plants', topic_id: null, extracted_text: SAMPLE_STUDY_TEXT }),
    ]);
    expect(get_skill_overview_text(database, user_id, skill.id)).toMatch('[From: Plants]');
  });
});

describe('resource importer helpers', () => {
  it('prepares extracted text, refusing empty text with a message for the resource type', () => {
    expect(prepare_extracted_text('  Plenty of readable text in here.  ', 'note')).toEqual({
      text: 'Plenty of readable text in here.',
      is_truncated: false,
    });
    expect(() => prepare_extracted_text(' ', 'pdf')).toThrow('That PDF has no text we can read');
  });

  it('turns a file name into a title', () => {
    expect(get_title_from_file_name('Week 3 notes.pdf')).toBe('Week 3 notes');
  });
});

describe('create_resource_importer', () => {
  // The importer with the mock transcriber.
  function create_test_importer() {
    const { transcriber } = create_spied_ai();
    return { transcriber, importer: create_resource_importer({ database, uploads_path, transcriber }) };
  }

  it('imports a PDF: extracts text, stores the file and names it after the file', async () => {
    const { importer } = create_test_importer();

    const resource = await importer.import_file({
      user_id,
      skill_id: skill.id,
      uploaded_file: { originalname: 'Plants.pdf', buffer: build_test_pdf('Leaves capture sunlight for energy') },
    });

    expect(resource).toMatchObject({ title: 'Plants', resource_type: 'pdf', is_truncated: false });
    const stored_resource = get_owned_resource(database, user_id, resource.id);
    expect(stored_resource.extracted_text).toContain('Leaves capture sunlight');
    expect(existsSync(path.join(uploads_path, stored_resource.file_path))).toBe(true);
  });

  it('transcribes audio uploads', async () => {
    const { importer, transcriber } = create_test_importer();

    const resource = await importer.import_file({
      user_id,
      skill_id: skill.id,
      uploaded_file: { originalname: 'lecture.mp3', buffer: Buffer.from('audio') },
      title: 'Lecture 1',
    });

    expect(transcriber.transcribe).toHaveBeenCalledWith(Buffer.from('audio'), 'lecture.mp3');
    expect(resource).toMatchObject({ title: 'Lecture 1', resource_type: 'audio' });
  });

  it('refuses unsupported files and saves nothing', async () => {
    const { importer } = create_test_importer();

    await expect(
      importer.import_file({ user_id, skill_id: skill.id, uploaded_file: { originalname: 'deck.pptx', buffer: Buffer.from('') } }),
    ).rejects.toThrow('That file type is not supported');
    expect(list_resources(database, user_id, skill.id)).toEqual([]);
  });

  it('imports YouTube links from their captions and title', async () => {
    fetch_youtube_transcript.mockResolvedValue(SAMPLE_STUDY_TEXT);
    fetch_youtube_title.mockResolvedValue('Photosynthesis explained');
    const { importer } = create_test_importer();

    const resource = await importer.import_link({ user_id, skill_id: skill.id, url: 'https://youtu.be/dQw4w9WgXcQ' });

    expect(fetch_youtube_transcript).toHaveBeenCalledWith('dQw4w9WgXcQ');
    expect(resource).toMatchObject({
      title: 'Photosynthesis explained',
      resource_type: 'youtube',
      source_url: 'https://youtu.be/dQw4w9WgXcQ',
    });
  });

  it('imports other links as articles, preferring the title the student typed', async () => {
    fetch_article.mockResolvedValue({ title: 'Page title', text: SAMPLE_STUDY_TEXT });
    const { importer } = create_test_importer();

    const resource = await importer.import_link({
      user_id,
      skill_id: skill.id,
      url: 'https://example.com/plants',
      title: 'My article',
    });

    expect(resource).toMatchObject({ title: 'My article', resource_type: 'article' });
  });

  it('imports typed notes', () => {
    const { importer } = create_test_importer();

    const resource = importer.import_typed_note({ user_id, skill_id: skill.id, title: 'Class notes', text: SAMPLE_STUDY_TEXT });

    expect(resource).toMatchObject({ title: 'Class notes', resource_type: 'note' });
  });
});

describe('to_upload_error', () => {
  it('explains files that are too large and other upload problems', () => {
    expect(to_upload_error({ code: 'LIMIT_FILE_SIZE' })).toMatchObject({ status: 413, message: expect.stringMatching('25 MB') });
    expect(to_upload_error({ code: 'LIMIT_UNEXPECTED_FILE' })).toMatchObject({ status: 400 });
  });
});
