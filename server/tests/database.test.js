import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';

const EXPECTED_TABLES = [
  'assistant_messages',
  'events',
  'glossary_terms',
  'guided_lessons',
  'learning_paths',
  'notes',
  'practice_sets',
  'quiz_results',
  'quizzes',
  'reading_guides',
  'resources',
  'sessions',
  'skill_nodes',
  'skills',
  'teach_sessions',
  'users',
  'widget_stacks',
  'widgets',
  'work_blocks',
];

let temporary_folder;

afterEach(() => {
  if (temporary_folder) rmSync(temporary_folder, { recursive: true, force: true });
  temporary_folder = undefined;
});

// Inserts a minimal valid user row for constraint tests.
function insert_user(database, user_id, username) {
  database
    .prepare(
      "INSERT INTO users (id, email, username, password_hash, first_name, last_name) VALUES (?, ?, ?, 'x', 'A', 'B')",
    )
    .run(user_id, `${user_id}@example.com`, username);
}

describe('open_database', () => {
  it('creates every table', () => {
    const database = open_database(IN_MEMORY_DATABASE);

    const table_names = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((table_row) => table_row.name);

    expect(table_names).toEqual(EXPECTED_TABLES);
  });

  it('creates the database file and its folder, and can reopen it', () => {
    temporary_folder = mkdtempSync(path.join(tmpdir(), 'studyapp-'));
    const database_path = path.join(temporary_folder, 'nested', 'studyapp.db');

    open_database(database_path).close();
    const reopened_database = open_database(database_path);

    expect(reopened_database.prepare('SELECT count(*) AS user_count FROM users').get().user_count).toBe(0);
    reopened_database.close();
  });

  it('cascades deletes from users to their rows', () => {
    const database = open_database(IN_MEMORY_DATABASE);
    insert_user(database, 'user-1', 'sam');
    database.prepare("INSERT INTO skills (id, user_id, name) VALUES ('skill-1', 'user-1', 'Biology')").run();

    database.prepare("DELETE FROM users WHERE id = 'user-1'").run();

    expect(database.prepare('SELECT count(*) AS skill_count FROM skills').get().skill_count).toBe(0);
  });

  it('treats usernames as case-insensitive and rejects symbols', () => {
    const database = open_database(IN_MEMORY_DATABASE);
    insert_user(database, 'user-1', 'Sam');

    expect(() => insert_user(database, 'user-2', 'sam')).toThrow(/UNIQUE/);
    expect(() => insert_user(database, 'user-3', 'sam!')).toThrow(/CHECK/);
  });

  it('refreshes updated_at when a user changes', () => {
    const database = open_database(IN_MEMORY_DATABASE);
    insert_user(database, 'user-1', 'sam');
    database.prepare("UPDATE users SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = 'user-1'").run();

    database.prepare("UPDATE users SET first_name = 'Alex' WHERE id = 'user-1'").run();

    const { updated_at } = database.prepare("SELECT updated_at FROM users WHERE id = 'user-1'").get();
    expect(updated_at > '2000-01-01T00:00:00.000Z').toBe(true);
  });
});
