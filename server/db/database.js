import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { add_missing_columns, move_pinned_paths } from './migrations.js';

const SCHEMA_PATH = path.join(import.meta.dirname, 'schema.sql');

// Opens the SQLite file (creating it and its folder if needed), switches on foreign keys
// so ON DELETE CASCADE works, creates any missing tables, and adds columns that older
// database files lack (moving old data where needed). Pass IN_MEMORY_DATABASE for a throwaway database, which is what
// the tests use.
export function open_database(database_path) {
  if (database_path !== IN_MEMORY_DATABASE) {
    mkdirSync(path.dirname(database_path), { recursive: true });
  }
  const database = new DatabaseSync(database_path);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  add_missing_columns(database);
  move_pinned_paths(database);
  return database;
}
