import { create_app } from './app.js';
import { open_database } from './db/database.js';
import { create_ai_provider, create_transcriber } from './services/ai/ai_providers.js';
import { create_chat_assistants } from './services/ai/chat_assistants.js';

// Opens the database, picks the AI providers from the environment, builds the app and
// starts listening. Returns the http.Server so callers (and tests) can close it.
export function start_server(env) {
  const ai_provider = create_ai_provider(env.ai);
  const transcriber = create_transcriber(env.ai);
  const app = create_app({
    database: open_database(env.database_path),
    uploads_path: env.uploads_path,
    client_origin: env.client_origin,
    ai_provider,
    transcriber,
    chat_assistants: create_chat_assistants(env.ai),
  });
  return app.listen(env.port, function announce_listening() {
    console.log(
      `StudyApp server listening on port ${env.port} (database: ${env.database_path}, AI: ${ai_provider.name}, transcription: ${transcriber.name})`,
    );
  });
}
