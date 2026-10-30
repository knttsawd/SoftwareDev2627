import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create_app } from '../app.js';
import { IN_MEMORY_DATABASE, MAX_TOPIC_DEPTH } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { build_topics_request, describe_topic_task } from '../services/ai/ai_prompts.js';
import { build_mock_topics } from '../services/ai/mock_ai_provider.js';
import { create_skill } from '../services/skill_service.js';
import { validate_topic_update_input } from '../services/study_validators.js';
import { generate_subtopics } from '../services/topic_resource_service.js';
import {
  add_topic,
  delete_topic,
  fits_under_parent,
  get_branch_height,
  get_owned_topic,
  get_topic_depth,
  list_topics,
  save_generated_topics,
  update_topic,
} from '../services/topic_service.js';
import { create_spied_ai, create_student_with_skill, insert_test_resource, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

let database;
let user_id;
let skill;

// Adds a chain of topics, each under the one before: ["Unit", "Lesson", ...] -> topics.
function add_topic_chain(topic_names) {
  const chain = [];
  for (const topic_name of topic_names) {
    chain.push(add_topic(database, user_id, skill.id, { topic: topic_name, parent_topic_id: chain.at(-1)?.id ?? null }));
  }
  return chain;
}

beforeEach(async () => {
  database = open_database(IN_MEMORY_DATABASE);
  ({ user_id, skill } = await create_student_with_skill(database));
});

describe('topic depth', () => {
  it('measures how deep a topic sits and how many levels its branch spans', () => {
    const [unit, lesson, detail] = add_topic_chain(['Unit', 'Lesson', 'Detail']);

    expect([get_topic_depth(database, unit.id), get_topic_depth(database, detail.id)]).toEqual([1, 3]);
    expect([get_branch_height(database, unit.id), get_branch_height(database, lesson.id), get_branch_height(database, detail.id)]).toEqual([
      3, 2, 1,
    ]);
    expect(fits_under_parent(database, null, MAX_TOPIC_DEPTH)).toBe(true);
    expect(fits_under_parent(database, detail.id, MAX_TOPIC_DEPTH - 2)).toBe(false);
  });

  it(`adds subtopics to subtopics, up to ${MAX_TOPIC_DEPTH} levels`, () => {
    const chain = add_topic_chain(Array.from({ length: MAX_TOPIC_DEPTH }, (_, level) => `Level ${level + 1}`));

    expect(get_topic_depth(database, chain.at(-1).id)).toBe(MAX_TOPIC_DEPTH);
    expect(() => add_topic(database, user_id, skill.id, { topic: 'Too deep', parent_topic_id: chain.at(-1).id })).toThrow(
      `at most ${MAX_TOPIC_DEPTH} levels`,
    );
  });

  it('counts the resources filed directly under each topic', () => {
    const [unit] = add_topic_chain(['Unit']);
    insert_test_resource(database, { user_id, skill_id: skill.id, topic_id: unit.id });

    expect(get_owned_topic(database, user_id, unit.id).resource_count).toBe(1);
  });
});

describe('update_topic', () => {
  it('renames a topic, refusing a name another topic has', () => {
    const [unit] = add_topic_chain(['Unit']);
    add_topic(database, user_id, skill.id, { topic: 'Other' });

    expect(update_topic(database, user_id, unit.id, { topic: 'Cells' }).topic).toBe('Cells');
    expect(update_topic(database, user_id, unit.id, { topic: 'cells' }).topic).toBe('cells');
    expect(() => update_topic(database, user_id, unit.id, { topic: 'Other' })).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('moves a topic with its branch under another topic, or to the top', () => {
    const [unit, lesson] = add_topic_chain(['Unit', 'Lesson']);
    const other_unit = add_topic(database, user_id, skill.id, { topic: 'Other unit' });

    expect(update_topic(database, user_id, unit.id, { parent_topic_id: other_unit.id }).parent_node_id).toBe(other_unit.id);
    expect(get_topic_depth(database, lesson.id)).toBe(3);
    expect(update_topic(database, user_id, unit.id, { parent_topic_id: null }).parent_node_id).toBeNull();
  });

  it('refuses loops, other skills and moves that would go too deep', () => {
    const chain = add_topic_chain(Array.from({ length: MAX_TOPIC_DEPTH }, (_, level) => `Level ${level + 1}`));
    const side_branch = add_topic_chain(['Side', 'Side lesson']);
    const atoms = add_topic(database, user_id, create_skill(database, user_id, { name: 'Chemistry' }).id, { topic: 'Atoms' });

    expect(() => update_topic(database, user_id, chain[0].id, { parent_topic_id: chain[2].id })).toThrow("can't go inside itself");
    expect(() => update_topic(database, user_id, chain[0].id, { parent_topic_id: chain[0].id })).toThrow("can't go inside itself");
    expect(() => update_topic(database, user_id, chain[0].id, { parent_topic_id: atoms.id })).toThrow('same skill');
    expect(() => update_topic(database, user_id, side_branch[0].id, { parent_topic_id: chain.at(-2).id })).toThrow('levels deep');
  });
});

describe('delete_topic', () => {
  it('moves the subtopics and resources up to the deleted topic’s parent', () => {
    const [unit, lesson, detail] = add_topic_chain(['Unit', 'Lesson', 'Detail']);
    const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id, topic_id: lesson.id });

    delete_topic(database, user_id, lesson.id);

    expect(get_owned_topic(database, user_id, detail.id).parent_node_id).toBe(unit.id);
    expect(database.prepare('SELECT skill_node_id FROM resources WHERE id = ?').get(resource_id).skill_node_id).toBe(unit.id);
  });
});

describe('generating subtopics', () => {
  it('describes the task for a whole subject or for one topic', () => {
    expect(describe_topic_task('text', null)[0]).toMatch('map out the topics');
    expect(describe_topic_task('', { topic: 'Cells' }).join('\n')).toMatch('subtopics of "Cells"');
  });

  it('tells the AI the topic to break down and the names to avoid', () => {
    const topics_request = build_topics_request({
      skill_name: 'Biology',
      source_text: '',
      max_topics: 6,
      focus_topic: { topic: 'Cells', summary: 'What cells are.' },
      existing_topics: ['Cells', 'DNA'],
    });

    expect(topics_request.user_prompt).toBe(
      'Subject: Biology\nTopic to break down: Cells (What cells are.)\nTopics the student already has (do not repeat): Cells; DNA',
    );
    expect(topics_request.system_prompt).toMatch('at most 6 topics');
  });

  it('skips topic names the skill already has in practice mode', () => {
    const { topics } = build_mock_topics({ source_text: SAMPLE_STUDY_TEXT, max_topics: 2, existing_topics: ['Photosynthesis'] });

    expect(topics.map((topic) => topic.topic)).not.toContain('Photosynthesis');
    expect(topics).toHaveLength(2);
    const focused = build_mock_topics({ source_text: SAMPLE_STUDY_TEXT, max_topics: 3, focus_topic: { topic: 'Calvin cycle' } });
    expect(focused.topics.map((topic) => topic.topic)).not.toContain('Calvin');
  });

  it('files new topics under the root topic, linking only to parents inside its branch', () => {
    const [unit] = add_topic_chain(['Unit']);
    add_topic(database, user_id, skill.id, { topic: 'Elsewhere' });

    save_generated_topics(
      database,
      user_id,
      skill.id,
      [
        { topic: 'Part A', summary: '', parent_topic: '' },
        { topic: 'Part A detail', summary: '', parent_topic: 'Part A' },
        { topic: 'Part B', summary: '', parent_topic: 'Elsewhere' },
      ],
      unit.id,
    );

    const parents = Object.fromEntries(list_topics(database, user_id, skill.id).map((topic) => [topic.topic, topic.parent_node_id]));
    const part_a_id = list_topics(database, user_id, skill.id).find((topic) => topic.topic === 'Part A').id;
    expect(parents).toMatchObject({ 'Part A': unit.id, 'Part A detail': part_a_id, 'Part B': unit.id });
  });

  it('breaks a topic into subtopics from its own resources', async () => {
    const [unit] = add_topic_chain(['Photosynthesis']);
    insert_test_resource(database, { user_id, skill_id: skill.id, topic_id: unit.id });
    const { ai_provider } = create_spied_ai();
    vi.spyOn(ai_provider, 'generate_topics');

    const topic_map = await generate_subtopics({ database, ai_provider, user_id, topic_id: unit.id });

    const subtopics = topic_map.topics.filter((topic) => topic.parent_node_id === unit.id);
    expect(subtopics.length).toBeGreaterThan(0);
    expect(ai_provider.generate_topics).toHaveBeenCalledWith(
      expect.objectContaining({ focus_topic: { topic: 'Photosynthesis', summary: null, topic_path: 'Photosynthesis' }, existing_topics: ['Photosynthesis'] }),
    );
  });

  it('refuses to go deeper than the limit', async () => {
    const chain = add_topic_chain(Array.from({ length: MAX_TOPIC_DEPTH }, (_, level) => `Level ${level + 1}`));
    const { ai_provider } = create_spied_ai();

    await expect(generate_subtopics({ database, ai_provider, user_id, topic_id: chain.at(-1).id })).rejects.toThrow('levels deep');
  });
});

describe('validate_topic_update_input', () => {
  it('needs a new name or a new parent', () => {
    expect(validate_topic_update_input({})).toEqual({ field_errors: { form: 'Nothing to update' }, values: {} });
    expect(validate_topic_update_input({ topic: ' Cells ', parent_topic_id: null })).toEqual({
      field_errors: {},
      values: { topic: 'Cells', parent_topic_id: null },
    });
    expect(validate_topic_update_input({ topic: '', parent_topic_id: 5 }).field_errors).toEqual({
      topic: 'Topic is required',
      parent_topic_id: 'Choose an item from the list',
    });
  });
});

describe('topic routes', () => {
  it('renames, moves and breaks down topics through the API', async () => {
    const { ai_provider, transcriber } = create_spied_ai();
    const app = create_app({ database: open_database(IN_MEMORY_DATABASE), uploads_path: '.', client_origin: '', ai_provider, transcriber });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);
    const api_skill = (await as_student('post', '/api/skills').send({ name: 'Biology' })).body;
    const unit = (await as_student('post', `/api/skills/${api_skill.id}/topics`).send({ topic: 'Unit' })).body;
    const lesson = (await as_student('post', `/api/skills/${api_skill.id}/topics`).send({ topic: 'Lesson' })).body;
    await as_student('post', `/api/skills/${api_skill.id}/resources/text`).send({ title: 'Notes', text: SAMPLE_STUDY_TEXT, topic_id: unit.id });

    const moved = await as_student('patch', `/api/topics/${lesson.id}`).send({ parent_topic_id: unit.id, topic: 'Lesson 1' });
    expect(moved.body).toMatchObject({ topic: 'Lesson 1', parent_node_id: unit.id });
    expect((await as_student('patch', `/api/topics/${unit.id}`).send({ parent_topic_id: lesson.id })).status).toBe(400);
    expect((await as_student('patch', `/api/topics/${unit.id}`).send({})).status).toBe(400);

    const generated = await as_student('post', `/api/topics/${unit.id}/generate`);
    expect(generated.status).toBe(200);
    expect(generated.body.topics.filter((topic) => topic.parent_node_id === unit.id).length).toBeGreaterThan(1);
  });
});
