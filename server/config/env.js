import {
  AI_PROVIDER_NAMES,
  DEFAULT_AI_PROVIDER,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_CLIENT_ORIGIN,
  DEFAULT_DATABASE_PATH,
  DEFAULT_GEMINI_MODELS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PORT,
  DEFAULT_UPLOADS_PATH,
  TRANSCRIPTION_PROVIDER_NAMES,
} from './constants.js';

// Returns value if it is one of allowed_names, otherwise throws a clear startup error.
export function read_choice(variable_name, value, allowed_names) {
  if (!allowed_names.includes(value)) {
    throw new Error(`${variable_name} must be one of: ${allowed_names.join(', ')} (got "${value}")`);
  }
  return value;
}

// "https://a.app, https://b.app" -> ["https://a.app", "https://b.app"]. Lets the API accept
// the live site and its preview deploys at once.
export function parse_origin_list(origin_text) {
  return origin_text
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// A model list with first_choice (from .env) at the front, if one was set, and no repeats.
export function build_model_chain(first_choice, default_chain) {
  return [...new Set([first_choice, ...default_chain].filter(Boolean))];
}

// Every API key for one provider: the main key, then any backup keys (comma-separated),
// without blanks or repeats. Requests take turns between them, so each key's rate limit
// fills up more slowly.
export function read_key_list(main_key, backup_keys_text) {
  const keys = [main_key, ...(backup_keys_text ?? '').split(',')].map((key) => key?.trim()).filter(Boolean);
  return [...new Set(keys)];
}

// Reads environment variables once at startup so the rest of the server never touches
// process.env. Every value has a default, so the server runs with no .env file at all.
// API keys are optional: the AI SDKs also look for their own credentials, and the mock
// providers need none.
export function read_env(source_env = process.env) {
  return {
    port: Number(source_env.PORT) || DEFAULT_PORT,
    client_origin: parse_origin_list(source_env.CLIENT_ORIGIN || DEFAULT_CLIENT_ORIGIN),
    database_path: source_env.DATABASE_PATH || DEFAULT_DATABASE_PATH,
    uploads_path: source_env.UPLOADS_PATH || DEFAULT_UPLOADS_PATH,
    ai: {
      provider: read_choice('AI_PROVIDER', source_env.AI_PROVIDER || DEFAULT_AI_PROVIDER, AI_PROVIDER_NAMES),
      transcription_provider: read_choice(
        'TRANSCRIPTION_PROVIDER',
        source_env.TRANSCRIPTION_PROVIDER || DEFAULT_AI_PROVIDER,
        TRANSCRIPTION_PROVIDER_NAMES,
      ),
      gemini_api_key: source_env.GEMINI_API_KEY || undefined,
      gemini_api_keys: read_key_list(source_env.GEMINI_API_KEY, source_env.GEMINI_BACKUP_API_KEYS),
      gemini_models: {
        light: build_model_chain(source_env.GEMINI_LIGHT_MODEL, DEFAULT_GEMINI_MODELS.light),
        standard: build_model_chain(source_env.GEMINI_STANDARD_MODEL, DEFAULT_GEMINI_MODELS.standard),
        build: build_model_chain(source_env.GEMINI_BUILD_MODEL, DEFAULT_GEMINI_MODELS.build),
        transcription: build_model_chain(source_env.GEMINI_TRANSCRIPTION_MODEL, DEFAULT_GEMINI_MODELS.transcription),
      },
      anthropic_api_key: source_env.ANTHROPIC_API_KEY || undefined,
      anthropic_model: source_env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      openai_api_key: source_env.OPENAI_API_KEY || undefined,
      openai_model: source_env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    },
  };
}
