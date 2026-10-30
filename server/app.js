import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { API_PREFIX, JSON_BODY_LIMIT } from './config/constants.js';
import { handle_errors, handle_not_found } from './middleware/handle_errors.js';
import { create_require_auth } from './middleware/require_auth.js';
import { create_account_router } from './routes/account_routes.js';
import { create_ai_router } from './routes/ai_routes.js';
import { create_assistant_router } from './routes/assistant_routes.js';
import { create_auth_router } from './routes/auth_routes.js';
import { create_event_router } from './routes/event_routes.js';
import { create_guided_lesson_router } from './routes/guided_lesson_routes.js';
import { create_health_router } from './routes/health_routes.js';
import { create_learning_quiz_router } from './routes/learning_quiz_routes.js';
import { create_practice_set_router } from './routes/practice_routes.js';
import { create_progress_router } from './routes/progress_routes.js';
import { create_skill_router } from './routes/skill_routes.js';
import {
  create_note_router,
  create_quiz_router,
  create_resource_router,
  create_topic_router,
} from './routes/study_item_routes.js';
import { create_teach_session_router } from './routes/teach_routes.js';
import { create_widget_router } from './routes/widget_routes.js';
import { create_widget_stack_router } from './routes/widget_stack_routes.js';
import { create_work_block_router } from './routes/work_block_routes.js';
import { create_chat_assistants } from './services/ai/chat_assistants.js';
import { create_resource_importer } from './services/resource_importer.js';

// Builds the Express app. Everything it depends on is passed in rather than imported, so
// tests can use an in-memory database, a temporary uploads folder and the mock AI:
//   database      open SQLite database (db/database.js)
//   uploads_path  folder for uploaded files
//   client_origin the website's URL (or a list of URLs), for CORS
//   ai_provider   { name, generate_notes, generate_quiz, ..., generate_lesson, explain_text, ... }
//                 (the full list is in services/ai/ai_providers.js)
//   transcriber   { name, transcribe } for audio and video
//   chat_assistants  the choice of AIs that can run the assistant (services/ai/chat_assistants.js);
//                 practice mode only if left out
//   client_build_path  the built website (client/dist), served from the same address if
//                 the folder exists; leave out for an API-only server
export function create_app({
  database,
  uploads_path,
  client_origin,
  ai_provider,
  transcriber,
  chat_assistants = create_chat_assistants({ provider: 'mock' }),
  client_build_path,
}) {
  const app = express();
  const require_auth = create_require_auth(database);
  const resource_importer = create_resource_importer({ database, uploads_path, transcriber });
  const study_dependencies = { database, uploads_path, ai_provider, chat_assistants, resource_importer };

  app.disable('x-powered-by');
  app.use(set_security_headers);
  app.use(cors({ origin: client_origin }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use(`${API_PREFIX}/health`, create_health_router());
  app.use(`${API_PREFIX}/auth`, create_auth_router(database, require_auth));
  app.use(`${API_PREFIX}/learning-quiz`, create_learning_quiz_router());
  app.use(`${API_PREFIX}/account`, require_auth, create_account_router(database, uploads_path));
  app.use(`${API_PREFIX}/skills`, require_auth, create_skill_router(study_dependencies));
  app.use(`${API_PREFIX}/resources`, require_auth, create_resource_router(study_dependencies));
  app.use(`${API_PREFIX}/notes`, require_auth, create_note_router(study_dependencies));
  app.use(`${API_PREFIX}/quizzes`, require_auth, create_quiz_router(study_dependencies));
  app.use(`${API_PREFIX}/topics`, require_auth, create_topic_router(study_dependencies));
  app.use(`${API_PREFIX}/progress`, require_auth, create_progress_router({ database }));
  app.use(`${API_PREFIX}/teach-sessions`, require_auth, create_teach_session_router(study_dependencies));
  app.use(`${API_PREFIX}/guided-lessons`, require_auth, create_guided_lesson_router(study_dependencies));
  app.use(`${API_PREFIX}/practice-sets`, require_auth, create_practice_set_router(study_dependencies));
  app.use(`${API_PREFIX}/events`, require_auth, create_event_router({ database }));
  app.use(`${API_PREFIX}/work-blocks`, require_auth, create_work_block_router({ database }));
  app.use(`${API_PREFIX}/assistant`, require_auth, create_assistant_router(study_dependencies));
  app.use(`${API_PREFIX}/widgets`, require_auth, create_widget_router({ database }));
  app.use(`${API_PREFIX}/widget-stacks`, require_auth, create_widget_stack_router({ database }));
  app.use(`${API_PREFIX}/ai`, require_auth, create_ai_router({ ai_provider, transcriber }));

  if (client_build_path && existsSync(client_build_path)) serve_client(app, client_build_path);

  app.use(handle_not_found);
  app.use(handle_errors);
  return app;
}

// Stops browsers guessing a file's type (so an upload can't run as a script) and stops
// other sites showing these pages in a frame to trick clicks. Widgets use srcdoc frames,
// which these headers don't affect.
function set_security_headers(req, res, next) {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
}

// Serves the built website's files. Any other GET outside /api gets index.html so the
// React router can show the page, and refreshing /dashboard/progress works (the same
// rewrite client/vercel.json does on Vercel).
function serve_client(app, client_build_path) {
  const index_path = path.join(client_build_path, 'index.html');
  app.use(express.static(client_build_path));
  app.use(function send_client_page(req, res, next) {
    if (req.method !== 'GET' || req.path.startsWith(API_PREFIX)) return next();
    return res.sendFile(index_path);
  });
}
