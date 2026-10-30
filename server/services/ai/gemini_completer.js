import { ApiError, GoogleGenAI } from '@google/genai';
import path from 'node:path';
import {
  GEMINI_FILE_POLL_INTERVAL_MS,
  GEMINI_FILE_READY_TIMEOUT_MS,
  GEMINI_INLINE_MEDIA_MAX_BYTES,
  GEMINI_THINKING_LEVEL,
  HTTP_STATUS,
} from '../../config/constants.js';
import { MEDIA_TYPE_BY_EXTENSION } from '../../config/media_types.js';
import { create_http_error } from '../http_error.js';
import { AI_ERROR_KIND, map_ai_error } from './ai_errors.js';

const GEMINI_KEY_VARIABLE = 'GEMINI_API_KEY';
// Statuses where trying the next model in the list may help: out of quota (429) or the
// model is overloaded or briefly down (5xx).
const RETRY_ON_NEXT_MODEL_STATUSES = [429, 500, 502, 503, 504];
// Statuses where another API key may get through: this key's quota is used up (429), or
// the key itself is refused (401, 403).
const RETRY_ON_NEXT_KEY_STATUSES = [401, 403, 429];
// The dedicated speech model may also refuse a format (400) that a general model accepts.
const TRANSCRIPTION_RETRY_STATUSES = [400, ...RETRY_ON_NEXT_MODEL_STATUSES];
const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);
const TRANSCRIPTION_PROMPT =
  'Transcribe the speech in this recording word for word. Reply with only the transcript, without timestamps.';
const FILE_STATE = { active: 'ACTIVE', failed: 'FAILED' };

// Sorts a Gemini error for map_ai_error. A bad key comes back as 400 with "API key" in
// the message, or as 401/403.
export function get_gemini_error_kind(gemini_error) {
  if (!(gemini_error instanceof ApiError)) return AI_ERROR_KIND.other;
  if ([401, 403].includes(gemini_error.status) || /api key/i.test(gemini_error.message)) return AI_ERROR_KIND.auth;
  if (RETRY_ON_NEXT_MODEL_STATUSES.includes(gemini_error.status)) return AI_ERROR_KIND.busy;
  return AI_ERROR_KIND.other;
}

export function map_gemini_error(gemini_error) {
  return map_ai_error(gemini_error, {
    error_kind: get_gemini_error_kind(gemini_error),
    key_variable_name: GEMINI_KEY_VARIABLE,
  });
}

// True for Gemini errors where the next model may do better: busy, down or out of quota.
export function is_retryable_gemini_error(model_error) {
  return model_error instanceof ApiError && RETRY_ON_NEXT_MODEL_STATUSES.includes(model_error.status);
}

// True for errors that another API key may avoid: out of quota, or a refused key (which
// Gemini also reports as a 400 mentioning the API key).
export function is_key_specific_gemini_error(key_error) {
  return key_error instanceof ApiError && (RETRY_ON_NEXT_KEY_STATUSES.includes(key_error.status) || /api key/i.test(key_error.message));
}

// Transcription also moves on when the speech model refuses a format a general model
// accepts (400), or hears nothing at all.
export function is_retryable_transcription_error(model_error) {
  if (model_error?.is_empty_transcript) return true;
  return model_error instanceof ApiError && TRANSCRIPTION_RETRY_STATUSES.includes(model_error.status);
}

// Runs run_model with each model in model_chain until one succeeds. Moves on to the next
// model only when should_try_next_model(error) says so; any other error, like a bad key,
// stops at once. Throws the last error when every model fails.
export async function run_with_model_fallback(model_chain, run_model, should_try_next_model = is_retryable_gemini_error) {
  let last_error;
  for (const model of model_chain) {
    try {
      return await run_model(model);
    } catch (model_error) {
      last_error = model_error;
      if (!should_try_next_model(model_error)) break;
    }
  }
  throw last_error;
}

// Spreads requests over several API keys (one client each). take_turn() returns the clients
// in the order one request should try them, each request starting one key further along
// than the last, so no single key's rate limit fills up first.
export function create_client_rotation(gemini_clients) {
  let next_index = 0;
  return function take_turn() {
    const start_index = next_index;
    next_index = (next_index + 1) % gemini_clients.length;
    return [...gemini_clients.slice(start_index), ...gemini_clients.slice(0, start_index)];
  };
}

// Runs run_with_client with each client until one succeeds. Moves on to the next key only
// when is_key_specific_gemini_error says another key may help; any other error stops at
// once. Throws the last error when every key fails.
export async function run_with_key_fallback(gemini_clients, run_with_client) {
  let last_error;
  for (const gemini_client of gemini_clients) {
    try {
      return await run_with_client(gemini_client);
    } catch (key_error) {
      last_error = key_error;
      if (!is_key_specific_gemini_error(key_error)) break;
    }
  }
  throw last_error;
}

// Checks why Gemini stopped and returns the parsed JSON answer. Structured output makes the
// text valid JSON, but a blocked or cut-off answer has to be caught first.
export function parse_gemini_json(response) {
  const finish_reason = response.candidates?.[0]?.finishReason;
  if (response.promptFeedback?.blockReason || BLOCKED_FINISH_REASONS.has(finish_reason)) {
    throw create_http_error(HTTP_STATUS.unprocessable, 'The AI declined to answer this request.');
  }
  if (finish_reason === 'MAX_TOKENS') {
    throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI answer was too long. Try a narrower topic.');
  }
  return JSON.parse(response.text);
}

export function create_gemini_client(api_key) {
  return new GoogleGenAI({ apiKey: api_key });
}

// A completer backed by Gemini. model_chains maps each task tier (AI_TASK_TIER) to its
// list of models, cheapest suitable model first; task_tier on the request picks the list.
// gemini_clients has one client per API key: each model is tried with every key (taking
// turns which goes first) before falling back to the next model, so a busy key never
// costs a better model. The clients are injectable for tests.
export function create_gemini_completer({ model_chains, gemini_clients }) {
  const take_turn = create_client_rotation(gemini_clients);
  return async function complete_json({ system_prompt, user_prompt, json_schema, task_tier }) {
    const clients_in_turn = take_turn();
    try {
      const response = await run_with_model_fallback(model_chains[task_tier], (model) =>
        run_with_key_fallback(clients_in_turn, (gemini_client) =>
          gemini_client.models.generateContent({
            model,
            contents: user_prompt,
            config: {
              systemInstruction: system_prompt,
              responseMimeType: 'application/json',
              responseJsonSchema: json_schema,
              thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL[task_tier] },
            },
          }),
        ),
      );
      return parse_gemini_json(response);
    } catch (completion_error) {
      throw map_gemini_error(completion_error);
    }
  };
}

// The media type Gemini expects for an audio or video file name, e.g. "talk.mp3" -> "audio/mp3".
export function get_media_type(file_name) {
  return MEDIA_TYPE_BY_EXTENSION[path.extname(file_name).toLowerCase()];
}

// Joins a transcript from a Gemini reply. The dedicated speech model puts its words in
// audioTranscription parts; general models use plain text parts.
export function read_transcript_text(response) {
  const reply_parts = response.candidates?.[0]?.content?.parts ?? [];
  return reply_parts
    .map((reply_part) => reply_part.audioTranscription?.text ?? reply_part.text ?? '')
    .join('')
    .trim();
}

// Waits until an uploaded file has finished processing on Google's side (videos take a
// moment). Throws if processing fails or takes longer than GEMINI_FILE_READY_TIMEOUT_MS.
export async function wait_for_file_ready(gemini_client, uploaded_file, poll_interval_ms = GEMINI_FILE_POLL_INTERVAL_MS) {
  const give_up_at = Date.now() + GEMINI_FILE_READY_TIMEOUT_MS;
  let current_file = uploaded_file;
  while (current_file.state !== FILE_STATE.active) {
    if (current_file.state === FILE_STATE.failed || Date.now() > give_up_at) {
      throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI could not process that recording. Please try again.');
    }
    await new Promise((resolve) => setTimeout(resolve, poll_interval_ms));
    current_file = await gemini_client.files.get({ name: current_file.name });
  }
  return current_file;
}

// Turns a recording into a message part for Gemini. Small files go inside the request;
// larger ones are uploaded first. Returns { media_part, uploaded_file_name } so the
// caller can delete the upload afterwards (uploaded_file_name is null for inline files).
export async function prepare_media_part(gemini_client, file_buffer, media_type) {
  if (file_buffer.length <= GEMINI_INLINE_MEDIA_MAX_BYTES) {
    return { media_part: { inlineData: { mimeType: media_type, data: file_buffer.toString('base64') } }, uploaded_file_name: null };
  }
  const uploaded_file = await gemini_client.files.upload({
    file: new Blob([file_buffer], { type: media_type }),
    config: { mimeType: media_type },
  });
  const ready_file = await wait_for_file_ready(gemini_client, uploaded_file);
  return { media_part: { fileData: { fileUri: ready_file.uri, mimeType: media_type } }, uploaded_file_name: ready_file.name };
}

// Asks one model for a transcript. An empty answer is thrown as an is_empty_transcript
// error, so the next model in the list gets a try.
export async function transcribe_with_model(gemini_client, model, media_part, media_type) {
  const response = await gemini_client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [media_part, { text: TRANSCRIPTION_PROMPT }] }],
    config: media_type.startsWith('video/') ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {},
  });
  const transcript_text = read_transcript_text(response);
  if (!transcript_text) {
    throw Object.assign(new Error(`${model} returned an empty transcript`), { is_empty_transcript: true });
  }
  return transcript_text;
}

// Transcribes with one API key's client, trying each model in model_chain in turn. A
// large recording is uploaded with this key (an upload only works with the key that made
// it) and deleted again afterwards.
export async function transcribe_with_client(gemini_client, model_chain, file_buffer, media_type) {
  let uploaded_file_name = null;
  try {
    const prepared_media = await prepare_media_part(gemini_client, file_buffer, media_type);
    uploaded_file_name = prepared_media.uploaded_file_name;
    return await run_with_model_fallback(
      model_chain,
      (model) => transcribe_with_model(gemini_client, model, prepared_media.media_part, media_type),
      is_retryable_transcription_error,
    );
  } finally {
    if (uploaded_file_name) await gemini_client.files.delete({ name: uploaded_file_name }).catch(() => {});
  }
}

// Speech-to-text for audio and video uploads with Gemini, trying each model in
// model_chain in turn, and the next API key (gemini_clients, one per key, taking turns)
// when a key is out of quota or refused. Video is read at low frame resolution, since only
// the speech matters, which keeps token use down. If every model hears nothing, the
// transcript is empty and the importer explains that no speech was found.
export function create_gemini_transcriber({ model_chain, gemini_clients }) {
  const take_turn = create_client_rotation(gemini_clients);
  async function transcribe(file_buffer, file_name) {
    const media_type = get_media_type(file_name);
    try {
      return await run_with_key_fallback(take_turn(), (gemini_client) =>
        transcribe_with_client(gemini_client, model_chain, file_buffer, media_type),
      );
    } catch (transcription_error) {
      if (transcription_error.is_empty_transcript) return '';
      throw map_gemini_error(transcription_error);
    }
  }
  return { name: 'gemini', transcribe };
}
