// Columns added to tables after the first release. schema.sql already has them for new
// database files; add_missing_columns adds them to older files, which schema.sql can't
// change because its CREATE TABLE IF NOT EXISTS skips tables that already exist.
// Each definition must match the column in schema.sql.
export const ADDED_COLUMNS = [
  { table_name: 'resources', column_name: 'skill_node_id', definition: 'TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL' },
  {
    table_name: 'quizzes',
    column_name: 'scope',
    definition: "TEXT NOT NULL DEFAULT 'topic' CHECK (scope IN ('skill', 'topic', 'resource'))",
  },
  { table_name: 'quizzes', column_name: 'resource_id', definition: 'TEXT REFERENCES resources (id) ON DELETE SET NULL' },
  {
    table_name: 'teach_sessions',
    column_name: 'ai_student_reasons',
    definition: "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(ai_student_reasons))",
  },
  { table_name: 'teach_sessions', column_name: 'teaching_feedback', definition: 'TEXT' },
  { table_name: 'users', column_name: 'assistant_id', definition: 'TEXT' },
  {
    table_name: 'resources',
    column_name: 'reading_section',
    definition: 'INTEGER NOT NULL DEFAULT 0 CHECK (reading_section >= 0)',
  },
  { table_name: 'widgets', column_name: 'layout', definition: "TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(layout))" },
  { table_name: 'widgets', column_name: 'pinned_paths', definition: "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(pinned_paths))" },
  { table_name: 'widget_stacks', column_name: 'pinned_paths', definition: "TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(pinned_paths))" },
];

// Older files kept one page per widget and stack in pinned_path. Copies it into
// pinned_paths as a one-page list and clears it, so it's moved only once. New files have no
// pinned_path column, so there's nothing to do.
export function move_pinned_paths(database) {
  for (const table_name of ['widgets', 'widget_stacks']) {
    if (!list_column_names(database, table_name).includes('pinned_path')) continue;
    database.exec(`UPDATE ${table_name} SET pinned_paths = json_array(pinned_path), pinned_path = NULL WHERE pinned_path IS NOT NULL`);
  }
}

// The names of a table's columns.
export function list_column_names(database, table_name) {
  return database
    .prepare(`PRAGMA table_info(${table_name})`)
    .all()
    .map((column_row) => column_row.name);
}

// Adds each column in added_columns that its table doesn't have yet. Table and column names
// come only from ADDED_COLUMNS, never from user input.
export function add_missing_columns(database, added_columns = ADDED_COLUMNS) {
  for (const { table_name, column_name, definition } of added_columns) {
    if (!list_column_names(database, table_name).includes(column_name)) {
      database.exec(`ALTER TABLE ${table_name} ADD COLUMN ${column_name} ${definition}`);
    }
  }
}
