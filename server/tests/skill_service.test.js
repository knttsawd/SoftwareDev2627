import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import {
  assert_skill_name_available,
  create_skill,
  delete_skill,
  get_owned_skill,
  list_skills,
  update_skill,
} from '../services/skill_service.js';
import {
  validate_skill_color,
  validate_skill_input,
  validate_skill_name,
} from '../services/skill_validators.js';
import { save_user_file } from '../services/storage_service.js';
import { create_test_account } from './helpers/test_accounts.js';
import { insert_test_resource } from './helpers/study_fixtures.js';

let database;
let user_id;

beforeEach(async () => {
  database = open_database(IN_MEMORY_DATABASE);
  user_id = (await create_test_account(database)).id;
});

describe('skill validators', () => {
  it('check names and colors', () => {
    expect(validate_skill_name('Biology')).toBeNull();
    expect(validate_skill_name(' ')).toBe('Skill name is required');
    expect(validate_skill_name('x'.repeat(81))).toMatch('at most 80');
    expect(validate_skill_color('#15803d')).toBeNull();
    expect(validate_skill_color('green')).toBe('Color must look like #4F46E5');
  });

  it('require a name for new skills and clean the values', () => {
    expect(validate_skill_input({ name: ' Biology ', color: '#15803d' })).toEqual({
      field_errors: {},
      values: { name: 'Biology', color: '#15803D' },
    });
    expect(validate_skill_input({ color: '#15803D' }).field_errors).toEqual({ name: 'Skill name is required' });
  });

  it('accept any single field when editing, but not nothing', () => {
    expect(validate_skill_input({ color: '#15803D' }, { is_partial: true })).toEqual({
      field_errors: {},
      values: { color: '#15803D' },
    });
    expect(validate_skill_input({}, { is_partial: true }).field_errors).toEqual({ form: 'Nothing to update' });
  });
});

describe('create_skill and list_skills', () => {
  it('creates skills with the default color and lists them oldest first with resource counts', () => {
    const biology = create_skill(database, user_id, { name: 'Biology' });
    create_skill(database, user_id, { name: 'Spanish', color: '#B91C1C' });
    insert_test_resource(database, { user_id, skill_id: biology.id });

    const skills = list_skills(database, user_id);

    expect(skills.map((skill) => skill.name)).toEqual(['Biology', 'Spanish']);
    expect(skills[0]).toMatchObject({ color: '#4F46E5', resource_count: 1 });
    expect(skills[1].resource_count).toBe(0);
  });

  it('refuses a duplicate name in any letter case', () => {
    create_skill(database, user_id, { name: 'Biology' });

    expect(() => create_skill(database, user_id, { name: 'BIOLOGY' })).toThrow(
      expect.objectContaining({ status: 409, extra_body: { field_errors: { name: 'You already have a skill with that name' } } }),
    );
  });

  it('lets two students use the same skill name', async () => {
    const { id: other_user_id } = await create_test_account(database, { username: 'other', email: 'o@example.com' });
    create_skill(database, user_id, { name: 'Biology' });

    expect(() => assert_skill_name_available(database, other_user_id, 'Biology')).not.toThrow();
  });
});

describe('get_owned_skill', () => {
  it("returns a 404 for another student's skill", async () => {
    const { id: other_user_id } = await create_test_account(database, { username: 'other', email: 'o@example.com' });
    const skill = create_skill(database, user_id, { name: 'Biology' });

    expect(() => get_owned_skill(database, other_user_id, skill.id)).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('update_skill', () => {
  it('renames and recolors, allowing the skill to keep its own name', () => {
    const skill = create_skill(database, user_id, { name: 'Biology' });

    const updated_skill = update_skill(database, user_id, skill.id, { name: 'Biology', color: '#15803D' });

    expect(updated_skill).toMatchObject({ name: 'Biology', color: '#15803D' });
  });

  it("refuses another of the student's skill names", () => {
    const skill = create_skill(database, user_id, { name: 'Biology' });
    create_skill(database, user_id, { name: 'Spanish' });

    expect(() => update_skill(database, user_id, skill.id, { name: 'spanish' })).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });
});

describe('delete_skill', () => {
  let uploads_path;

  afterEach(() => {
    rmSync(uploads_path, { recursive: true, force: true });
  });

  it('removes the skill, its resources and their files', async () => {
    uploads_path = mkdtempSync(path.join(tmpdir(), 'studyapp-uploads-'));
    const skill = create_skill(database, user_id, { name: 'Biology' });
    const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id });
    const file_path = await save_user_file(uploads_path, user_id, 'notes.pdf', Buffer.from('pdf'));
    database.prepare('UPDATE resources SET file_path = ? WHERE id = ?').run(file_path, resource_id);

    await delete_skill(database, uploads_path, user_id, skill.id);

    expect(list_skills(database, user_id)).toEqual([]);
    expect(database.prepare('SELECT count(*) AS resource_count FROM resources').get().resource_count).toBe(0);
    expect(existsSync(path.join(uploads_path, file_path))).toBe(false);
  });
});
