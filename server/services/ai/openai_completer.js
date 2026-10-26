import OpenAI, { toFile } from 'openai';
import { WHISPER_MODEL } from '../../config/constants.js';
import { get_sdk_error_kind, map_ai_error } from './ai_errors.js';

const OPENAI_KEY_VARIABLE = 'OPENAI_API_KEY';

// A completer backed by an OpenAI chat model, returning JSON that matches json_schema.
// openai_client is injectable for tests.
export function create_openai_completer({ api_key, model, openai_client = new OpenAI({ apiKey: api_key }) }) {
  return async function complete_json({ system_prompt, user_prompt, json_schema }) {
    try {
      const completion = await openai_client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content: user_prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'study_material', schema: json_schema, strict: true },
        },
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (completion_error) {
      throw map_ai_error(completion_error, {
        error_kind: get_sdk_error_kind(completion_error, OpenAI),
        key_variable_name: OPENAI_KEY_VARIABLE,
      });
    }
  };
}

// Speech-to-text with OpenAI's Whisper API, for audio and video uploads.
export function create_openai_transcriber({ api_key, openai_client = new OpenAI({ apiKey: api_key }) }) {
  async function transcribe(file_buffer, file_name) {
    try {
      const transcription = await openai_client.audio.transcriptions.create({
        file: await toFile(file_buffer, file_name),
        model: WHISPER_MODEL,
      });
      return transcription.text;
    } catch (transcription_error) {
      throw map_ai_error(transcription_error, {
        error_kind: get_sdk_error_kind(transcription_error, OpenAI),
        key_variable_name: OPENAI_KEY_VARIABLE,
      });
    }
  }
  return { name: 'openai', transcribe };
}
