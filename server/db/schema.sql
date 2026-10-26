-- StudyApp database schema (SQLite). open_database() runs this file every time the server
-- starts. Every statement uses IF NOT EXISTS, so running it again is safe and only adds
-- whatever is missing.
--
-- Conventions:
--   ids are UUID text made in JavaScript (crypto.randomUUID)
--   timestamps are ISO-8601 UTC text, e.g. 2026-10-24T17:05:00.000Z
--   JSON columns are text checked with json_valid()
--   every student-owned table has user_id -> users.id ON DELETE CASCADE, so deleting a
--   user deletes all their data (needs PRAGMA foreign_keys = ON, set in open_database)
--
-- Limits below mirror server/config/constants.js; change both together.
--
-- Tables that already exist are never changed by this file, so a column added later is
-- also listed in db/migrations.js, which adds it to older database files.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  -- NOCASE makes uniqueness and lookups case-insensitive: "Sam" and "sam" are the same username.
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE
    CHECK (length(username) BETWEEN 3 AND 30 AND username NOT GLOB '*[^A-Za-z0-9_]*'),
  -- "<salt hex>:<scrypt hash hex>", made by password_service.hash_password
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 50),
  last_name TEXT NOT NULL CHECK (length(last_name) BETWEEN 1 AND 50),
  -- Answers from the learning style and goals quiz (shape defined in Phase 2).
  learning_profile TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(learning_profile)),
  work_minutes INTEGER NOT NULL DEFAULT 25 CHECK (work_minutes BETWEEN 5 AND 120),
  break_minutes INTEGER NOT NULL DEFAULT 5 CHECK (break_minutes BETWEEN 1 AND 60),
  -- Which AI runs the assistant (an id from config/chat_assistants.js); NULL means the server default.
  assistant_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Login sessions. Only a SHA-256 hash of each token is stored, so a copied database file
-- cannot be used to log in as anyone.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- A skill is also a "subject" on the schedule, so its color lives here.
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  color TEXT NOT NULL DEFAULT '#4F46E5' CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS skills_user_name_key ON skills (user_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  -- The skill-map topic (unit) this resource belongs to; NULL = the skill in general.
  skill_node_id TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  resource_type TEXT NOT NULL
    CHECK (resource_type IN ('note', 'pdf', 'video', 'audio', 'article', 'youtube')),
  source_url TEXT,
  -- Path of an uploaded file, relative to the uploads folder: "<user_id>/<file name>".
  file_path TEXT,
  extracted_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  error_message TEXT,
  -- Active reading: the section the student is up to (see services/reading_service.js).
  reading_section INTEGER NOT NULL DEFAULT 0 CHECK (reading_section >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS resources_skill_idx ON resources (skill_id);

-- Topics on the skill map. mastery_score NULL = not quizzed yet (gray node).
CREATE TABLE IF NOT EXISTS skill_nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  parent_node_id TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  summary TEXT,
  mastery_score REAL CHECK (mastery_score BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS skill_nodes_skill_topic_key ON skill_nodes (skill_id, topic COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  skill_node_id TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS notes_skill_idx ON notes (skill_id);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  skill_node_id TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL,
  -- What the quiz covers: the whole skill, one topic (a map topic or a typed one), or one resource.
  scope TEXT NOT NULL DEFAULT 'topic' CHECK (scope IN ('skill', 'topic', 'resource')),
  resource_id TEXT REFERENCES resources (id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  -- [{ "question": text, "choices": [text], "correct_index": int, "explanation": text }]
  questions TEXT NOT NULL CHECK (json_valid(questions)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS quizzes_skill_idx ON quizzes (skill_id);

-- One "teach the AI student" session: the lesson, then a quiz both the student and AI student take.
CREATE TABLE IF NOT EXISTS teach_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  skill_node_id TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  -- [{ "role": "teacher" | "ai_student", "content": text }]
  lesson_messages TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(lesson_messages)),
  quiz_id TEXT REFERENCES quizzes (id) ON DELETE SET NULL,
  combined_score REAL CHECK (combined_score BETWEEN 0 AND 100),
  -- The AI student's reason for each quiz answer, in question order: [text]
  ai_student_reasons TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(ai_student_reasons)),
  -- The AI student's short note to the teacher on what was explained well and what was missing.
  teaching_feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS quiz_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  teach_session_id TEXT REFERENCES teach_sessions (id) ON DELETE CASCADE,
  taker TEXT NOT NULL DEFAULT 'student' CHECK (taker IN ('student', 'ai_student')),
  -- Chosen choice index per question, in question order; null for a skipped question.
  answers TEXT NOT NULL CHECK (json_valid(answers)),
  correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
  total_count INTEGER NOT NULL CHECK (total_count > 0),
  score REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS quiz_results_user_idx ON quiz_results (user_id, completed_at);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT REFERENCES skills (id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  details TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS events_user_start_idx ON events (user_id, starts_at);

CREATE TABLE IF NOT EXISTS work_blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events (id) ON DELETE SET NULL,
  skill_id TEXT REFERENCES skills (id) ON DELETE SET NULL,
  activity TEXT NOT NULL CHECK (activity IN ('quiz', 'assignment')),
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
  completed_minutes INTEGER NOT NULL DEFAULT 0 CHECK (completed_minutes >= 0),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT
);

-- The assistant's conversation, one per student.
CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  -- What the assistant did in this reply: [{ "id", "tool", "arguments", "label", "status"
  -- ("done" | "failed" | "pending" | "cancelled"), "summary", "link", "widget_id" }]
  actions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(actions)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS assistant_messages_user_idx ON assistant_messages (user_id, created_at);

-- Widgets and tools the assistant made, which can be pinned to pages.
CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('card', 'app')),
  -- card: { "blocks": [...] }; app: { "html", "height" } (see services/widget_service.js)
  spec TEXT NOT NULL CHECK (json_valid(spec)),
  -- What the student has done with it, like ticked checklist items.
  state TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state)),
  -- Where it shows: [] (only in the Widgets tab), ["*"] (every dashboard page) or a list of
  -- page paths, e.g. ["/dashboard/learn", "/dashboard/quiz"].
  pinned_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(pinned_paths)),
  -- How it sits on the page and how it looks (DEFAULT_WIDGET_LAYOUT).
  layout TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(layout)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS widgets_user_idx ON widgets (user_id);

-- Smart stacks: widgets shown together in one place, one at a time.
CREATE TABLE IF NOT EXISTS widget_stacks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The widgets in it, in order: a JSON list of widget ids (see services/widget_stack_service.js).
  widget_ids TEXT NOT NULL CHECK (json_valid(widget_ids)),
  -- "swipe" between them, or pick one from a "list".
  view TEXT NOT NULL DEFAULT 'swipe' CHECK (view IN ('swipe', 'list')),
  active_widget_id TEXT,
  pinned_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(pinned_paths)),
  layout TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(layout)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS widget_stacks_user_idx ON widget_stacks (user_id);

-- A guided lesson: the AI teaches one topic in short steps, each ending in a check question.
CREATE TABLE IF NOT EXISTS guided_lessons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  skill_node_id TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  -- [{ "title", "explanation_markdown", "example_markdown",
  --    "checks": [{ "reteach_markdown" (null for the first), "question", "choices", "correct_index",
  --                 "explanation", "chosen_index" (null until answered) }] }]
  steps TEXT NOT NULL CHECK (json_valid(steps)),
  -- The step the student is on (0-based). It stays on the last step once completed_at is set.
  current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS guided_lessons_skill_idx ON guided_lessons (user_id, skill_id);

-- The order a student learns a skill's topics in. One per skill; steps refer to skill_nodes.
CREATE TABLE IF NOT EXISTS learning_paths (
  skill_id TEXT PRIMARY KEY REFERENCES skills (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- [{ "topic_id", "reason" }] in learning order
  steps TEXT NOT NULL CHECK (json_valid(steps)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Practice with hints: a worked example, then problems the student solves (not graded).
CREATE TABLE IF NOT EXISTS practice_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  skill_node_id TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  -- { "problem", "steps": [text], "answer" }
  worked_example TEXT NOT NULL CHECK (json_valid(worked_example)),
  -- [{ "problem", "hints": [text], "solution_steps": [text], "answer", "hints_shown",
  --    "is_solution_shown", "attempts": [{ "answer", "is_correct", "feedback" }] }]
  problems TEXT NOT NULL CHECK (json_valid(problems)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS practice_sets_skill_idx ON practice_sets (user_id, skill_id);

-- Active reading: the AI's guide to one section of a resource, made once and kept.
CREATE TABLE IF NOT EXISTS reading_guides (
  resource_id TEXT NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
  section_index INTEGER NOT NULL CHECK (section_index >= 0),
  explanation_markdown TEXT NOT NULL,
  think_about TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (resource_id, section_index)
);

-- Key terms for a skill, each optionally linked to the topic it belongs to.
CREATE TABLE IF NOT EXISTS glossary_terms (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  skill_node_id TEXT REFERENCES skill_nodes (id) ON DELETE SET NULL,
  term TEXT NOT NULL COLLATE NOCASE CHECK (length(term) BETWEEN 1 AND 80),
  definition TEXT NOT NULL CHECK (length(definition) BETWEEN 1 AND 600),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (skill_id, term)
);

-- Keep updated_at current. The WHEN guard skips rows whose update already set it,
-- which also stops the trigger's own UPDATE from firing it again.
CREATE TRIGGER IF NOT EXISTS users_set_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS skill_nodes_set_updated_at
  AFTER UPDATE ON skill_nodes
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE skill_nodes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
