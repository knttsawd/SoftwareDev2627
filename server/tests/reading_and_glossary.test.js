import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { create_app } from '../app.js';
import { IN_MEMORY_DATABASE, MAX_GLOSSARY_TERMS_PER_SKILL } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import { explain_another_way } from '../services/explain_service.js';
import {
  add_glossary_term,
  count_room_for_terms,
  delete_glossary_term,
  generate_glossary_terms,
  list_glossary_terms,
} from '../services/glossary_service.js';
import { validate_explain_input, validate_glossary_term_input, validate_passage } from '../services/learning_validators.js';
import {
  clamp_position,
  explain_reading_passage,
  get_reading_overview,
  get_reading_section,
  guide_reading_section,
  is_heading_line,
  list_reading_resources,
  make_section_title,
  save_reading_position,
  split_into_reading_sections,
  split_long_paragraph,
} from '../services/reading_service.js';
import { create_skill } from '../services/skill_service.js';
import { add_topic } from '../services/topic_service.js';
import { create_student_with_skill, insert_test_resource, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

const BOOK_TEXT = ['# Chapter 1', 'Plants make food from light.', 'Chapter 2: Cells', 'Cells are small. They divide.'].join('\n\n');

// A student with a skill and one resource, and a spied mock AI.
async function create_reader(text = SAMPLE_STUDY_TEXT) {
  const database = open_database(IN_MEMORY_DATABASE);
  const { user_id, skill } = await create_student_with_skill(database);
  const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id, text });
  const ai_provider = create_mock_ai_provider();
  vi.spyOn(ai_provider, 'guide_reading_section');
  vi.spyOn(ai_provider, 'explain_text');
  return { database, user_id, skill, resource_id, ai_provider };
}

describe('splitting text into reading sections', () => {
  it('spots heading lines', () => {
    expect(is_heading_line('Chapter 2: Cells')).toBe(true);
    expect(is_heading_line('## Respiration')).toBe(true);
    expect(is_heading_line('Cells are small.')).toBe(false);
    expect(is_heading_line('2024')).toBe(false);
    expect(is_heading_line('Line one\nline two')).toBe(false);
  });

  it('splits long paragraphs between sentences, and cuts over-long sentences', () => {
    expect(split_long_paragraph('Short.', 50)).toEqual(['Short.']);
    expect(split_long_paragraph('One two. Three four. Five six.', 20)).toEqual(['One two. Three four.', 'Five six.']);
    expect(split_long_paragraph('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('titles a section by its opening words', () => {
    expect(make_section_title('Short first line\nmore')).toBe('Short first line');
    expect(make_section_title(`${'word '.repeat(20)}end`)).toMatch(/^word( word)*…$/);
  });

  it('starts a section at each heading and keeps sections near the target length', () => {
    expect(split_into_reading_sections(BOOK_TEXT)).toEqual([
      { title: 'Chapter 1', text: 'Plants make food from light.' },
      { title: 'Chapter 2: Cells', text: 'Cells are small. They divide.' },
    ]);
    const sections = split_into_reading_sections(SAMPLE_STUDY_TEXT, 250);
    expect(sections.length).toBeGreaterThan(2);
    expect(sections.every((section) => section.text.length <= 250)).toBe(true);
    expect(split_into_reading_sections('')).toEqual([]);
  });

  it('keeps a saved position inside the sections', () => {
    expect(clamp_position(9, 3)).toBe(2);
    expect(clamp_position(1, 3)).toBe(1);
    expect(clamp_position(0, 0)).toBe(0);
  });
});

describe('active reading', () => {
  it('lists the sections and where the student is up to', async () => {
    const { database, user_id, skill, resource_id } = await create_reader(BOOK_TEXT);
    expect(get_reading_overview(database, user_id, resource_id)).toEqual({
      resource: { id: resource_id, skill_id: skill.id, topic_id: null, title: 'Chapter 1', resource_type: 'note' },
      sections: [
        { index: 0, title: 'Chapter 1', character_count: 28, has_guide: false },
        { index: 1, title: 'Chapter 2: Cells', character_count: 29, has_guide: false },
      ],
      position: 0,
    });
    expect(save_reading_position(database, user_id, resource_id, 1)).toEqual({ position: 1 });
    expect(list_reading_resources(database, user_id, skill.id)).toEqual([
      { resource_id, title: 'Chapter 1', resource_type: 'note', topic_id: null, section_count: 2, position: 1 },
    ]);
    expect(() => save_reading_position(database, user_id, resource_id, 5)).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => get_reading_overview(database, 'someone-else', resource_id)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('makes a section guide once, then reuses it', async () => {
    const { database, user_id, resource_id, ai_provider } = await create_reader(BOOK_TEXT);
    expect(get_reading_section(database, user_id, resource_id, 1)).toMatchObject({ title: 'Chapter 2: Cells', guide: null });

    const guided = await guide_reading_section({ database, ai_provider, user_id, resource_id, section_index: 1 });
    await guide_reading_section({ database, ai_provider, user_id, resource_id, section_index: 1 });

    expect(guided.guide).toHaveProperty('think_about');
    expect(ai_provider.guide_reading_section).toHaveBeenCalledOnce();
    expect(ai_provider.guide_reading_section.mock.calls[0][0]).toMatchObject({ resource_title: 'Chapter 1', section_text: 'Cells are small. They divide.' });
    expect(get_reading_overview(database, user_id, resource_id).sections[1].has_guide).toBe(true);
    await expect(guide_reading_section({ database, ai_provider, user_id, resource_id, section_index: 7 })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('explains a passage using its section as the material', async () => {
    const { database, user_id, resource_id, ai_provider } = await create_reader();
    await explain_reading_passage({ database, ai_provider, user_id, resource_id, section_index: 0, passage: 'stomata' });
    expect(ai_provider.explain_text.mock.calls[0][0]).toMatchObject({ skill_name: 'Biology', text: 'stomata', style: 'plain' });
    expect(ai_provider.explain_text.mock.calls[0][0].context_text).toMatch('stomata');
  });
});

describe('explain another way', () => {
  it('validates the text, the style and the topic', () => {
    expect(validate_explain_input({ text: ' Cells ', style: 'simpler' })).toEqual({
      field_errors: {},
      values: { text: 'Cells', style: 'simpler', topic_id: null },
    });
    expect(validate_explain_input({ text: '', style: 'rhyme', topic_id: '' }).field_errors).toEqual({
      text: 'Nothing to explain',
      style: 'Choose one of: simpler, analogy, example, deeper, plain',
      topic_id: 'Choose an item from the list',
    });
    expect(validate_passage('')).toBe('Select or type the part you want explained');
  });

  it('gives the AI the skill’s matching resources and checks the topic is in the skill', async () => {
    const { database, user_id, skill, ai_provider } = await create_reader();
    const topic = add_topic(database, user_id, skill.id, { topic: 'Light' });
    const explanation = await explain_another_way({
      database,
      ai_provider,
      user_id,
      skill,
      explain_details: { text: 'Chlorophyll absorbs sunlight.', style: 'analogy', topic_id: topic.id },
    });
    expect(explanation).toHaveProperty('explanation_markdown');
    expect(ai_provider.explain_text.mock.calls[0][0]).toMatchObject({ style: 'analogy', skill_name: 'Biology' });
    expect(ai_provider.explain_text.mock.calls[0][0].context_text).toMatch('Chlorophyll');

    const other_skill = create_skill(database, user_id, { name: 'Maths' });
    await expect(
      explain_another_way({ database, ai_provider, user_id, skill: other_skill, explain_details: { text: 'x', style: 'simpler', topic_id: topic.id } }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('key terms', () => {
  it('validates a term written by hand', () => {
    expect(validate_glossary_term_input({ term: ' Osmosis ', definition: ' Water moving. ' }).values).toEqual({
      term: 'Osmosis',
      definition: 'Water moving.',
      topic_id: null,
    });
    expect(validate_glossary_term_input({}).field_errors).toEqual({ term: 'Term is required', definition: 'Definition is required' });
  });

  it('adds terms by hand, refuses repeats in any case, and lists them alphabetically', async () => {
    const { database, user_id, skill } = await create_reader();
    const topic = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    add_glossary_term(database, user_id, skill.id, { term: 'Osmosis', definition: 'Water moving.', topic_id: topic.id });
    add_glossary_term(database, user_id, skill.id, { term: 'enzyme', definition: 'A helper protein.', topic_id: null });

    expect(() => add_glossary_term(database, user_id, skill.id, { term: 'OSMOSIS', definition: 'Again.', topic_id: null })).toThrow(
      expect.objectContaining({ status: 409, extra_body: { field_errors: { term: 'You already have this term' } } }),
    );
    expect(list_glossary_terms(database, user_id, skill.id).map((glossary_term) => [glossary_term.term, glossary_term.topic_id])).toEqual([
      ['enzyme', null],
      ['Osmosis', topic.id],
    ]);
    expect(count_room_for_terms(database, user_id, skill.id)).toBe(MAX_GLOSSARY_TERMS_PER_SKILL - 2);
  });

  it('adds the AI’s new terms, linked to topics by name', async () => {
    const { database, user_id, skill } = await create_reader();
    const topic = add_topic(database, user_id, skill.id, { topic: 'Cells' });
    add_glossary_term(database, user_id, skill.id, { term: 'Osmosis', definition: 'Water moving.', topic_id: null });
    const ai_provider = {
      ...create_mock_ai_provider(),
      generate_glossary: vi.fn().mockResolvedValue({
        terms: [
          { term: 'Nucleus', definition: 'The control centre.', topic: 'cells' },
          { term: 'osmosis', definition: 'Again.', topic: '' },
          { term: 'Enzyme', definition: 'A helper.', topic: 'Unknown' },
        ],
      }),
    };

    const { added_count, terms } = await generate_glossary_terms({ database, ai_provider, user_id, skill });

    expect(added_count).toBe(2);
    expect(terms.map((glossary_term) => [glossary_term.term, glossary_term.topic_id])).toEqual([
      ['Enzyme', null],
      ['Nucleus', topic.id],
      ['Osmosis', null],
    ]);
    expect(ai_provider.generate_glossary.mock.calls[0][0]).toMatchObject({ topics: ['Cells'], existing_terms: ['Osmosis'], max_terms: 12 });
  });

  it('refuses new terms when the skill is full, and deletes only its own terms', async () => {
    const { database, user_id, skill, ai_provider } = await create_reader();
    const glossary_term = add_glossary_term(database, user_id, skill.id, { term: 'Osmosis', definition: 'Water.', topic_id: null });
    expect(() => delete_glossary_term(database, user_id, 'other-skill', glossary_term.id)).toThrow(expect.objectContaining({ status: 404 }));
    delete_glossary_term(database, user_id, skill.id, glossary_term.id);
    expect(list_glossary_terms(database, user_id, skill.id)).toEqual([]);

    const insert_term = database.prepare("INSERT INTO glossary_terms (id, user_id, skill_id, term, definition) VALUES (?, ?, ?, ?, 'd')");
    for (let term_number = 0; term_number < MAX_GLOSSARY_TERMS_PER_SKILL; term_number += 1) {
      insert_term.run(`t${term_number}`, user_id, skill.id, `term ${term_number}`);
    }
    await expect(generate_glossary_terms({ database, ai_provider, user_id, skill })).rejects.toMatchObject({ status: 409 });
  });
});

describe('reading, key term and explain routes', () => {
  it('reads a resource, keeps key terms and explains another way', async () => {
    const app = create_app({
      database: open_database(IN_MEMORY_DATABASE),
      uploads_path: '.',
      client_origin: '',
      ai_provider: create_mock_ai_provider(),
      transcriber: null,
    });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);
    const skill = (await as_student('post', '/api/skills').send({ name: 'Biology' })).body;
    const resource = (await as_student('post', `/api/skills/${skill.id}/resources/text`).send({ title: 'Notes', text: SAMPLE_STUDY_TEXT })).body;
    const reading_url = `/api/resources/${resource.id}/reading`;

    expect((await as_student('get', `/api/skills/${skill.id}/reading`)).body).toHaveLength(1);
    expect((await as_student('get', reading_url)).body.sections.length).toBeGreaterThan(0);
    expect((await as_student('get', `${reading_url}/sections/0`)).body.guide).toBeNull();
    expect((await as_student('get', `${reading_url}/sections/x`)).status).toBe(404);
    expect((await as_student('post', `${reading_url}/sections/0/guide`)).body.guide).toHaveProperty('explanation_markdown');
    expect((await as_student('put', `${reading_url}/position`).send({ section_index: 0 })).body).toEqual({ position: 0 });
    expect((await as_student('post', `${reading_url}/explain`).send({ passage: '' })).status).toBe(400);
    expect((await as_student('post', `${reading_url}/explain`).send({ passage: 'stomata', section_index: 0 })).status).toBe(200);

    const explain_url = `/api/skills/${skill.id}/explain`;
    expect((await as_student('post', explain_url).send({ text: 'x', style: 'nope' })).status).toBe(400);
    expect((await as_student('post', explain_url).send({ text: 'Chlorophyll absorbs sunlight.', style: 'simpler' })).body).toHaveProperty(
      'explanation_markdown',
    );

    const glossary_url = `/api/skills/${skill.id}/glossary`;
    expect((await as_student('post', glossary_url).send({ term: '' })).status).toBe(400);
    const added = await as_student('post', glossary_url).send({ term: 'Osmosis', definition: 'Water moving.' });
    expect(added.status).toBe(201);
    expect((await as_student('post', `${glossary_url}/generate`)).body.added_count).toBeGreaterThan(0);
    expect((await as_student('delete', `${glossary_url}/${added.body.id}`)).status).toBe(204);
    expect((await as_student('get', glossary_url)).body.some((glossary_term) => glossary_term.term === 'Osmosis')).toBe(false);
  });
});
