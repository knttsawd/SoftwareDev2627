import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { add_missing_columns, ADDED_COLUMNS, list_column_names } from '../db/migrations.js';
import {
  label_chunk,
  order_for_even_coverage,
  select_focused_source_text,
  select_overview_text,
  select_source_text,
  SOURCE_LABEL_PREFIX,
} from '../services/ai/source_selection.js';
import {
  create_practice_quiz,
  get_owned_quiz,
  plan_quiz,
  plan_resource_quiz,
  plan_skill_quiz,
  plan_topic_quiz,
  submit_quiz_answers,
} from '../services/quiz_service.js';
import { clean_topic_id, validate_resource_topic_id } from '../services/resource_validators.js';
import { create_skill } from '../services/skill_service.js';
import {
  find_quiz_scope_errors,
  validate_quiz_input,
  validate_required_id,
  validate_resource_topic_input,
} from '../services/study_validators.js';
import {
  get_topic_source_text,
  move_resource_to_topic,
  resolve_resource_topic_id,
} from '../services/topic_resource_service.js';
import { add_topic, delete_topic, get_owned_topic, list_topic_branch_ids } from '../services/topic_service.js';
import { create_spied_ai, create_student_with_skill, insert_test_resource } from './helpers/study_fixtures.js';

const CELL_TEXT = 'Cells are the basic unit of life. Every cell has a membrane around it.';
const GENETICS_TEXT = 'Genes are made of DNA. Cells copy their DNA before they divide.';
const UNRELATED_TEXT = 'Ecosystems include every living thing in an area and the climate around it.';

let database;
let user_id;
let skill;
let ai_provider;

beforeEach(async () => {
  database = open_database(IN_MEMORY_DATABASE);
  ({ user_id, skill } = await create_student_with_skill(database));
  ({ ai_provider } = create_spied_ai());
});

describe('add_missing_columns and list_column_names', () => {
  it('adds new columns to a database made before they existed, and leaves current ones alone', () => {
    const old_database = new DatabaseSync(IN_MEMORY_DATABASE);
    old_database.exec('CREATE TABLE things (id TEXT PRIMARY KEY)');
    const added_columns = [{ table_name: 'things', column_name: 'color', definition: "TEXT NOT NULL DEFAULT 'red'" }];

    add_missing_columns(old_database, added_columns);
    add_missing_columns(old_database, added_columns);

    expect(list_column_names(old_database, 'things')).toEqual(['id', 'color']);
  });

  it('lists only columns that schema.sql also has, so new databases already match', () => {
    for (const { table_name, column_name } of ADDED_COLUMNS) {
      expect(list_column_names(database, table_name)).toContain(column_name);
    }
  });
});

describe('source selection', () => {
  it('labels a chunk with its resource', () => {
    expect(label_chunk('Week 1', 'Text.')).toBe(`${SOURCE_LABEL_PREFIX}Week 1]\nText.`);
  });

  it('orders positions so the first few spread across the whole text', () => {
    expect(order_for_even_coverage(0)).toEqual([]);
    expect(order_for_even_coverage(1)).toEqual([0]);
    expect(order_for_even_coverage(8)).toEqual([0, 4, 2, 6, 1, 3, 5, 7]);
    expect([...order_for_even_coverage(5)].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('samples a long resource from start to end, not just its opening', () => {
    const long_text = ['Part one.', 'Part two.', 'Part three.', 'Part four.'].join('\n\n');

    const overview_text = select_overview_text([{ title: 'Book', extracted_text: long_text }], { max_characters: 20, chunk_size: 12 });

    expect(overview_text).toContain('Part one.');
    expect(overview_text).toContain('Part three.');
    expect(overview_text).not.toContain('Part two.');
  });

  it('can leave out chunks that never mention the topic', () => {
    const sources = [{ title: 'Mixed', extracted_text: `${CELL_TEXT}\n\n${UNRELATED_TEXT}` }];

    expect(select_source_text(sources, 'membrane', { chunk_size: 80, only_matching: true })).not.toContain('Ecosystems');
    expect(select_source_text(sources, 'unmentioned', { chunk_size: 80, only_matching: true })).toBe('');
    expect(select_source_text(sources, 'unmentioned', { chunk_size: 80 })).toContain('Ecosystems');
  });

  it("puts a topic's own resources first, then matching parts of the others", () => {
    const focus_sources = [{ title: 'Unit notes', extracted_text: CELL_TEXT }];
    const other_sources = [
      { title: 'Genetics', extracted_text: GENETICS_TEXT },
      { title: 'Ecology', extracted_text: UNRELATED_TEXT },
    ];

    const focused_text = select_focused_source_text(focus_sources, other_sources, 'cells');

    expect(focused_text.indexOf('[From: Unit notes]')).toBe(0);
    expect(focused_text).toContain('[From: Genetics]');
    expect(focused_text).not.toContain('[From: Ecology]');
  });
});

describe('topics with their own resources', () => {
  it('finds a topic and every topic below it', () => {
    const unit = add_topic(database, user_id, skill.id, { topic: 'Cell biology' });
    const lesson = add_topic(database, user_id, skill.id, { topic: 'Membranes', parent_topic_id: unit.id });
    const detail = add_topic(database, user_id, skill.id, { topic: 'Channels', parent_topic_id: lesson.id });
    add_topic(database, user_id, skill.id, { topic: 'Ecology' });

    expect(list_topic_branch_ids(database, unit.id).sort()).toEqual([unit.id, lesson.id, detail.id].sort());
    expect(list_topic_branch_ids(database, detail.id)).toEqual([detail.id]);
  });

  it('only files resources under topics in the same skill', () => {
    const unit = add_topic(database, user_id, skill.id, { topic: 'Cell biology' });
    const other_skill = create_skill(database, user_id, { name: 'Chemistry' });
    const atoms = add_topic(database, user_id, other_skill.id, { topic: 'Atoms' });

    expect(resolve_resource_topic_id(database, user_id, skill.id, unit.id)).toBe(unit.id);
    expect(resolve_resource_topic_id(database, user_id, skill.id, null)).toBeNull();
    expect(() => resolve_resource_topic_id(database, user_id, skill.id, atoms.id)).toThrow('different skill');
  });

  it('moves a resource into a topic and back out, and keeps it when the topic is deleted', () => {
    const unit = add_topic(database, user_id, skill.id, { topic: 'Cell biology' });
    const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id });

    expect(move_resource_to_topic(database, user_id, resource_id, unit.id)).toMatchObject({ id: resource_id, topic_id: unit.id });
    expect(move_resource_to_topic(database, user_id, resource_id, null).topic_id).toBeNull();

    move_resource_to_topic(database, user_id, resource_id, unit.id);
    delete_topic(database, user_id, unit.id);
    expect(move_resource_to_topic(database, user_id, resource_id, null)).toMatchObject({ id: resource_id });
  });

  it("builds a topic's AI text from its own and its subtopics' resources first", () => {
    const unit = add_topic(database, user_id, skill.id, { topic: 'Cell biology' });
    const lesson = add_topic(database, user_id, skill.id, { topic: 'Genetics', parent_topic_id: unit.id });
    insert_test_resource(database, { user_id, skill_id: skill.id, title: 'Ecology', text: UNRELATED_TEXT });
    insert_test_resource(database, { user_id, skill_id: skill.id, title: 'DNA notes', text: GENETICS_TEXT, topic_id: lesson.id });

    const unit_text = get_topic_source_text(database, user_id, skill.id, { search_text: 'Cell biology', topic_id: unit.id });

    expect(unit_text.startsWith('[From: DNA notes]')).toBe(true);
    expect(unit_text).not.toContain('Ecology');
  });

  it('falls back to the best matches across the skill when the topic has no resources, and to nothing with none at all', () => {
    expect(get_topic_source_text(database, user_id, skill.id, { search_text: 'cells' })).toBe('');

    const unit = add_topic(database, user_id, skill.id, { topic: 'Cell biology' });
    insert_test_resource(database, { user_id, skill_id: skill.id, title: 'Cells', text: CELL_TEXT });

    expect(get_topic_source_text(database, user_id, skill.id, { search_text: 'cells', topic_id: unit.id })).toContain('[From: Cells]');
  });
});

describe('quiz scopes', () => {
  it('plans a quiz on one resource, counting toward its topic', () => {
    const unit = add_topic(database, user_id, skill.id, { topic: 'Cell biology' });
    const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id, title: 'Week 3', topic_id: unit.id });

    expect(plan_resource_quiz(database, user_id, skill, resource_id)).toMatchObject({
      scope: 'resource',
      topic: 'Week 3',
      topic_id: unit.id,
      resource_id,
      ai_topic: 'the resource "Week 3"',
      is_source_only: true,
    });
  });

  it('refuses a resource from another skill', () => {
    const other_skill = create_skill(database, user_id, { name: 'Chemistry' });
    const resource_id = insert_test_resource(database, { user_id, skill_id: other_skill.id });

    expect(() => plan_resource_quiz(database, user_id, skill, resource_id)).toThrow('different skill');
  });

  it('plans a quiz on the whole skill, with or without resources', () => {
    expect(plan_skill_quiz(database, user_id, skill)).toMatchObject({
      scope: 'skill',
      topic: 'All of Biology',
      topic_id: null,
      source_text: '',
      is_source_only: false,
    });
    insert_test_resource(database, { user_id, skill_id: skill.id, title: 'Plants' });
    expect(plan_skill_quiz(database, user_id, skill).source_text).toContain('[From: Plants]');
  });

  it('plans a quiz on a map topic or a typed topic', () => {
    const unit = add_topic(database, user_id, skill.id, { topic: 'Cell biology' });

    expect(plan_topic_quiz(database, user_id, skill, { topic_id: unit.id })).toMatchObject({
      scope: 'topic',
      topic: 'Cell biology',
      topic_id: unit.id,
      resource_id: null,
    });
    expect(plan_topic_quiz(database, user_id, skill, { topic: 'Osmosis' }).topic_id).toBeNull();
  });

  it('picks the plan for each scope', () => {
    const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id });

    expect(plan_quiz(database, user_id, skill, { scope: 'skill' }).scope).toBe('skill');
    expect(plan_quiz(database, user_id, skill, { scope: 'resource', resource_id }).scope).toBe('resource');
    expect(plan_quiz(database, user_id, skill, { scope: 'topic', topic: 'Cells' }).scope).toBe('topic');
  });

  it('saves a resource quiz and moves its topic on the map when graded', async () => {
    const unit = add_topic(database, user_id, skill.id, { topic: 'Cell biology' });
    const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id, topic_id: unit.id });

    const quiz = await create_practice_quiz({
      database,
      ai_provider,
      user_id,
      skill,
      quiz_details: { scope: 'resource', resource_id, question_count: 3 },
    });
    submit_quiz_answers(database, user_id, get_owned_quiz(database, user_id, quiz.id), [null, null, null]);

    expect(quiz).toMatchObject({ scope: 'resource', resource_id, topic_id: unit.id });
    expect(ai_provider.generate_quiz).toHaveBeenCalledWith(expect.objectContaining({ is_source_only: true }));
    expect(get_owned_topic(database, user_id, unit.id).mastery_level).toBe('weak');
  });
});

describe('quiz scope and resource topic validators', () => {
  it('requires a non-empty id', () => {
    expect(validate_required_id('resource-1')).toBeNull();
    expect(validate_required_id(' ')).toBe('Choose an item from the list');
    expect(validate_required_id(undefined)).toBe('Choose an item from the list');
  });

  it('checks the details each scope needs', () => {
    expect(find_quiz_scope_errors('everything', {})).toEqual({ scope: 'Choose what to quiz on' });
    expect(find_quiz_scope_errors('resource', {})).toEqual({ resource_id: 'Choose an item from the list' });
    expect(find_quiz_scope_errors('topic', {})).toEqual({ topic: 'Topic is required' });
    expect(find_quiz_scope_errors('skill', {})).toEqual({});
  });

  it('keeps only the details that belong to the scope', () => {
    expect(validate_quiz_input({ scope: 'resource', resource_id: 'r1', topic: 'ignored' }).values).toEqual({
      scope: 'resource',
      topic: null,
      topic_id: null,
      resource_id: 'r1',
      question_count: 5,
    });
    expect(validate_quiz_input({ scope: 'skill', question_count: 4 }).values).toMatchObject({ scope: 'skill', question_count: 4 });
  });

  it('checks the topic a resource is moved to', () => {
    expect(validate_resource_topic_input({ topic_id: 'topic-1' })).toEqual({ field_errors: {}, values: { topic_id: 'topic-1' } });
    expect(validate_resource_topic_input({ topic_id: null }).values).toEqual({ topic_id: null });
    expect(validate_resource_topic_input({}).field_errors).toEqual({ topic_id: 'Choose a topic' });
    expect(validate_resource_topic_input({ topic_id: 4 }).field_errors).toEqual({ topic_id: 'Choose an item from the list' });
  });

  it('treats a blank topic on a new resource as none', () => {
    expect(validate_resource_topic_id('')).toBeNull();
    expect(validate_resource_topic_id(undefined)).toBeNull();
    expect(validate_resource_topic_id(['x'])).toBe('Choose a topic from the list');
    expect(clean_topic_id(' topic-1 ')).toBe('topic-1');
    expect(clean_topic_id('')).toBeNull();
  });
});
