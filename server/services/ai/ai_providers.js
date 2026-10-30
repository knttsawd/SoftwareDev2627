import { create_anthropic_completer } from './anthropic_completer.js';
import { create_gemini_client, create_gemini_completer, create_gemini_transcriber } from './gemini_completer.js';
import { create_llm_ai_provider } from './llm_ai_provider.js';
import { create_mock_ai_provider } from './mock_ai_provider.js';
import { create_openai_completer, create_openai_transcriber } from './openai_completer.js';

// The one place that builds AI providers, from the "ai" part of read_env(). Every provider
// has the same shape: { name, generate_notes, generate_quiz, generate_topics, plan_assistant_step,
// reply_as_ai_student, take_quiz_as_ai_student, plus the learning features: generate_lesson,
// reteach_lesson_step, order_learning_path, generate_practice, check_practice_answer,
// guide_reading_section, explain_text, generate_glossary, and build_widget_app (the app
// builder) }, each taking one request object. To
// change the main provider, set AI_PROVIDER in server/.env; to add a provider, add a
// branch to create_named_ai_provider.

// One Gemini client per key in ai_config.gemini_api_keys. With no key set, one client
// without a key, which lets the Gemini SDK look for its own credentials.
export function create_gemini_clients(ai_config) {
  const api_keys = ai_config.gemini_api_keys?.length ? ai_config.gemini_api_keys : [undefined];
  return api_keys.map(create_gemini_client);
}

// The provider called provider_name (an AI_PROVIDER_NAMES entry), using the keys and
// models in ai_config. Unknown names get the mock.
export function create_named_ai_provider(provider_name, ai_config) {
  if (provider_name === 'gemini') {
    return create_llm_ai_provider(
      'gemini',
      create_gemini_completer({
        model_chains: ai_config.gemini_models,
        gemini_clients: create_gemini_clients(ai_config),
      }),
    );
  }
  if (provider_name === 'anthropic') {
    return create_llm_ai_provider(
      'anthropic',
      create_anthropic_completer({ api_key: ai_config.anthropic_api_key, model: ai_config.anthropic_model }),
    );
  }
  if (provider_name === 'openai') {
    return create_llm_ai_provider(
      'openai',
      create_openai_completer({ api_key: ai_config.openai_api_key, model: ai_config.openai_model }),
    );
  }
  return create_mock_ai_provider();
}

// The main provider, used for notes, quizzes and topics: the one named by AI_PROVIDER.
export function create_ai_provider(ai_config) {
  return create_named_ai_provider(ai_config.provider, ai_config);
}

// A stand-in transcript, so audio and video uploads still work without a speech-to-text key.
export function create_mock_transcriber() {
  async function transcribe(file_buffer, file_name) {
    return (
      `Practice-mode transcript for "${file_name}". ` +
      'Real speech-to-text is off, so this recording was saved without its words. ' +
      'Set TRANSCRIPTION_PROVIDER in server/.env to transcribe recordings.'
    );
  }
  return { name: 'mock', transcribe };
}

// Speech-to-text for audio and video: { name, transcribe(file_buffer, file_name) }.
export function create_transcriber(ai_config) {
  if (ai_config.transcription_provider === 'gemini') {
    return create_gemini_transcriber({
      model_chain: ai_config.gemini_models.transcription,
      gemini_clients: create_gemini_clients(ai_config),
    });
  }
  if (ai_config.transcription_provider === 'openai') {
    return create_openai_transcriber({ api_key: ai_config.openai_api_key });
  }
  return create_mock_transcriber();
}
