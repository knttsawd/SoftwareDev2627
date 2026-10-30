import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create_app } from '../app.js';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { build_test_pdf } from './helpers/build_test_pdf.js';
import { NEEDS_SOURCES_MESSAGE } from '../services/ai/mock_ai_provider.js';
import { create_spied_ai, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

vi.mock('../services/extraction/article_extractor.js', () => ({ fetch_article: vi.fn() }));

const { fetch_article } = await import('../services/extraction/article_extractor.js');

let app;
let uploads_path;
let auth_header;

beforeEach(async () => {
  uploads_path = mkdtempSync(path.join(tmpdir(), 'studyapp-uploads-'));
  const { ai_provider, transcriber } = create_spied_ai();
  app = create_app({
    database: open_database(IN_MEMORY_DATABASE),
    uploads_path,
    client_origin: 'http://localhost:5173',
    ai_provider,
    transcriber,
  });
  const signup_response = await request(app).post('/api/auth/signup').send(TEST_SIGNUP);
  auth_header = `Bearer ${signup_response.body.token}`;
});

afterEach(() => {
  rmSync(uploads_path, { recursive: true, force: true });
});

// Sends a request as the signed-up test student.
function as_student(method, url) {
  return request(app)[method](url).set('Authorization', auth_header);
}

// Creates a skill through the API and returns it.
async function add_skill(name = 'Biology') {
  return (await as_student('post', '/api/skills').send({ name })).body;
}

// Adds a typed note resource with study text to a skill through the API.
async function add_study_text(skill_id) {
  return (await as_student('post', `/api/skills/${skill_id}/resources/text`).send({ title: 'Chapter 1', text: SAMPLE_STUDY_TEXT })).body;
}

describe('/api/skills', () => {
  it('requires a login', async () => {
    expect((await request(app).get('/api/skills')).status).toBe(401);
  });

  it('creates, lists, edits and deletes skills', async () => {
    const created_response = await as_student('post', '/api/skills').send({ name: 'Biology', color: '#15803d' });
    expect(created_response.status).toBe(201);
    expect(created_response.body).toMatchObject({ name: 'Biology', color: '#15803D', resource_count: 0 });

    const skill_id = created_response.body.id;
    expect((await as_student('get', '/api/skills')).body).toHaveLength(1);

    const edited_response = await as_student('patch', `/api/skills/${skill_id}`).send({ name: 'Cell Biology' });
    expect(edited_response.body.name).toBe('Cell Biology');

    expect((await as_student('delete', `/api/skills/${skill_id}`)).status).toBe(204);
    expect((await as_student('get', '/api/skills')).body).toEqual([]);
  });

  it('validates skills and 404s unknown ones', async () => {
    expect((await as_student('post', '/api/skills').send({})).status).toBe(400);
    expect((await as_student('patch', '/api/skills/missing').send({ name: 'X' })).status).toBe(404);
    expect((await as_student('get', '/api/skills/missing/resources')).status).toBe(404);
  });
});

describe('/api/skills/:skill_id/resources', () => {
  it('uploads a PDF and lists it', async () => {
    const skill = await add_skill();

    const upload_response = await as_student('post', `/api/skills/${skill.id}/resources/files`)
      .field('title', 'Leaves')
      .attach('file', build_test_pdf('Leaves capture sunlight for photosynthesis'), 'leaves.pdf');

    expect(upload_response.status).toBe(201);
    expect(upload_response.body).toMatchObject({ title: 'Leaves', resource_type: 'pdf', is_truncated: false });
    expect((await as_student('get', `/api/skills/${skill.id}/resources`)).body).toHaveLength(1);
  });

  it('explains a missing or unsupported file', async () => {
    const skill = await add_skill();

    const missing_response = await as_student('post', `/api/skills/${skill.id}/resources/files`).field('title', 'Nothing');
    const unsupported_response = await as_student('post', `/api/skills/${skill.id}/resources/files`).attach(
      'file',
      Buffer.from('slides'),
      'deck.pptx',
    );

    expect(missing_response.body.error).toBe('Choose a file to upload');
    expect(unsupported_response.status).toBe(400);
    expect(unsupported_response.body.error).toMatch('That file type is not supported');
  });

  it('adds article links', async () => {
    fetch_article.mockResolvedValue({ title: 'Plants', text: SAMPLE_STUDY_TEXT });
    const skill = await add_skill();

    const link_response = await as_student('post', `/api/skills/${skill.id}/resources/links`).send({ url: 'https://example.com/plants' });

    expect(link_response.status).toBe(201);
    expect(link_response.body).toMatchObject({ title: 'Plants', resource_type: 'article' });
  });

  it('adds typed notes, validating the title', async () => {
    const skill = await add_skill();

    expect((await as_student('post', `/api/skills/${skill.id}/resources/text`).send({ text: 'notes' })).status).toBe(400);
    expect((await add_study_text(skill.id)).resource_type).toBe('note');
  });
});

describe('/api/resources/:resource_id', () => {
  it('returns the full text without the file path, and deletes', async () => {
    const skill = await add_skill();
    const resource = await add_study_text(skill.id);

    const read_response = await as_student('get', `/api/resources/${resource.id}`);
    expect(read_response.body.extracted_text).toMatch('Photosynthesis');
    expect(read_response.body).not.toHaveProperty('file_path');

    expect((await as_student('delete', `/api/resources/${resource.id}`)).status).toBe(204);
    expect((await as_student('get', `/api/resources/${resource.id}`)).status).toBe(404);
  });
});

describe('notes and quizzes', () => {
  it('explains that practice mode needs resources, since it has no general knowledge', async () => {
    const skill = await add_skill();

    const notes_response = await as_student('post', `/api/skills/${skill.id}/notes`).send({ topic: 'Cells' });

    expect(notes_response.status).toBe(422);
    expect(notes_response.body.error).toBe(NEEDS_SOURCES_MESSAGE);
  });

  it('generates, lists and deletes notes', async () => {
    const skill = await add_skill();
    await add_study_text(skill.id);

    const note_response = await as_student('post', `/api/skills/${skill.id}/notes`).send({ topic: 'Photosynthesis' });
    expect(note_response.status).toBe(201);
    expect(note_response.body.content).toMatch('## Key points');

    expect((await as_student('get', `/api/skills/${skill.id}/notes`)).body).toHaveLength(1);
    expect((await as_student('delete', `/api/notes/${note_response.body.id}`)).status).toBe(204);
  });

  it('generates quizzes without answers, then lists, reads and deletes them', async () => {
    const skill = await add_skill();
    await add_study_text(skill.id);

    const quiz_response = await as_student('post', `/api/skills/${skill.id}/quizzes`).send({ topic: 'Photosynthesis', question_count: 3 });
    expect(quiz_response.status).toBe(201);
    expect(quiz_response.body.questions).toHaveLength(3);
    expect(quiz_response.body.questions[0]).not.toHaveProperty('correct_index');

    const quiz_id = quiz_response.body.id;
    expect((await as_student('get', `/api/skills/${skill.id}/quizzes`)).body[0].question_count).toBe(3);
    expect((await as_student('get', `/api/quizzes/${quiz_id}`)).body.topic).toBe('Photosynthesis');
    expect((await as_student('delete', `/api/quizzes/${quiz_id}`)).status).toBe(204);
  });

  it('validates the topic and question count', async () => {
    const skill = await add_skill();

    const quiz_response = await as_student('post', `/api/skills/${skill.id}/quizzes`).send({ topic: '', question_count: 50 });

    expect(quiz_response.status).toBe(400);
    expect(Object.keys(quiz_response.body.field_errors)).toEqual(['topic', 'question_count']);
  });
});

describe('GET /api/ai/status', () => {
  it('reports which AI and transcription providers are active', async () => {
    const status_response = await as_student('get', '/api/ai/status');

    expect(status_response.body).toEqual({ ai_provider: 'mock', transcription_provider: 'mock' });
  });
});

describe('topics, checking and grading routes', () => {
  it('builds the topic map with AI topics and manual topics, and deletes topics', async () => {
    const skill = await add_skill();
    await add_study_text(skill.id);

    const generated_response = await as_student('post', `/api/skills/${skill.id}/topics/generate`);
    expect(generated_response.status).toBe(200);
    expect(generated_response.body.topics.length).toBeGreaterThan(0);
    expect(generated_response.body.suggestions.length).toBeGreaterThan(0);

    const added_response = await as_student('post', `/api/skills/${skill.id}/topics`).send({ topic: 'Leaf structure' });
    expect(added_response.status).toBe(201);
    expect(added_response.body.mastery_level).toBe('untested');

    expect((await as_student('delete', `/api/topics/${added_response.body.id}`)).status).toBe(204);
    expect((await as_student('get', `/api/skills/${skill.id}/topics`)).body.topics).toHaveLength(generated_response.body.topics.length);
  });

  it('quizzes on a map topic, checks an answer, grades the quiz and updates the topic', async () => {
    const skill = await add_skill();
    await add_study_text(skill.id);
    const topic = (await as_student('post', `/api/skills/${skill.id}/topics`).send({ topic: 'Photosynthesis' })).body;

    const quiz = (await as_student('post', `/api/skills/${skill.id}/quizzes`).send({ topic_id: topic.id, question_count: 3 })).body;
    expect(quiz.topic_id).toBe(topic.id);

    const check_response = await as_student('post', `/api/quizzes/${quiz.id}/check`).send({ question_index: 0, answer_index: 0 });
    expect(check_response.body).toEqual({ is_correct: expect.any(Boolean), correct_index: expect.any(Number), explanation: expect.any(String) });

    const graded_response = await as_student('post', `/api/quizzes/${quiz.id}/results`).send({ answers: [0, 0, null] });
    expect(graded_response.status).toBe(201);
    expect(graded_response.body.question_results).toHaveLength(3);
    expect(graded_response.body.topic.mastery_score).toBe(graded_response.body.result.score);

    const results_response = await as_student('get', `/api/skills/${skill.id}/results`);
    expect(results_response.body[0]).toMatchObject({ topic: 'Photosynthesis', score: graded_response.body.result.score });
  });

  it('rejects bad answer checks and answer lists', async () => {
    const skill = await add_skill();
    await add_study_text(skill.id);
    const quiz = (await as_student('post', `/api/skills/${skill.id}/quizzes`).send({ topic: 'Photosynthesis', question_count: 3 })).body;

    expect((await as_student('post', `/api/quizzes/${quiz.id}/check`).send({ question_index: 9, answer_index: 0 })).status).toBe(400);
    const graded_response = await as_student('post', `/api/quizzes/${quiz.id}/results`).send({ answers: [0] });
    expect(graded_response.status).toBe(400);
    expect(graded_response.body.field_errors.answers).toMatch('one answer for each');
  });
});

describe('/api/events', () => {
  const STUDY_SESSION = { title: 'Study cells', starts_at: '2026-10-26T10:00:00.000Z', ends_at: '2026-10-26T11:00:00.000Z' };

  it('adds, lists, reads, edits and deletes events', async () => {
    const skill = await add_skill();
    const created_response = await as_student('post', '/api/events').send({ ...STUDY_SESSION, skill_id: skill.id });
    expect(created_response.status).toBe(201);
    expect(created_response.body).toMatchObject({ skill_name: 'Biology' });
    const event_id = created_response.body.id;

    const listed_response = await as_student('get', '/api/events').query({ from: '2026-10-26T00:00:00Z', to: '2026-11-02T00:00:00Z' });
    expect(listed_response.body.map((event) => event.id)).toEqual([event_id]);
    expect((await as_student('get', `/api/events/${event_id}`)).body.title).toBe('Study cells');

    const edited_response = await as_student('patch', `/api/events/${event_id}`).send({ title: 'Review cells' });
    expect(edited_response.body).toMatchObject({ title: 'Review cells', starts_at: STUDY_SESSION.starts_at });

    expect((await as_student('delete', `/api/events/${event_id}`)).status).toBe(204);
  });

  it('validates events and ranges', async () => {
    expect((await as_student('post', '/api/events').send({ title: 'No times' })).body.field_errors).toHaveProperty('starts_at');
    expect((await as_student('get', '/api/events')).status).toBe(400);
    expect((await as_student('get', '/api/events/missing')).status).toBe(404);
  });
});

describe('/api/work-blocks', () => {
  it('starts, reports and finishes a work block', async () => {
    const event = (
      await as_student('post', '/api/events').send({
        title: 'Essay',
        starts_at: '2026-10-26T10:00:00.000Z',
        ends_at: '2026-10-26T11:00:00.000Z',
      })
    ).body;

    const started_response = await as_student('post', '/api/work-blocks').send({ activity: 'assignment', event_id: event.id });
    expect(started_response.status).toBe(201);
    expect(started_response.body).toMatchObject({ event_title: 'Essay', planned_minutes: 25, break_minutes: 5 });

    expect((await as_student('get', '/api/work-blocks/active')).body.work_block.id).toBe(started_response.body.id);

    const finished_response = await as_student('post', `/api/work-blocks/${started_response.body.id}/finish`).send({ completed_minutes: 10 });
    expect(finished_response.body.completed_minutes).toBe(10);
    expect((await as_student('get', '/api/work-blocks/active')).body).toEqual({ work_block: null });
  });

  it('validates work block requests', async () => {
    const bad_start = await as_student('post', '/api/work-blocks').send({ activity: 'nap', planned_minutes: 1 });
    expect(Object.keys(bad_start.body.field_errors)).toEqual(['activity', 'planned_minutes']);

    const started = (await as_student('post', '/api/work-blocks').send({ activity: 'quiz' })).body;
    const bad_finish = await as_student('post', `/api/work-blocks/${started.id}/finish`).send({ completed_minutes: -1 });
    expect(bad_finish.status).toBe(400);
  });
});
