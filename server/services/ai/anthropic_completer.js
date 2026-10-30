import Anthropic from '@anthropic-ai/sdk';
import { AI_MAX_OUTPUT_TOKENS, HTTP_STATUS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { get_sdk_error_kind, map_ai_error } from './ai_errors.js';

// Server-side fallback: if the model declines a request for policy reasons, the API retries
// it on a suitable fallback model inside the same call.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
// Notes and quizzes are routine work, so a moderate thinking effort keeps them quick and cheap.
const STUDY_TASK_EFFORT = 'medium';

// Joins the text blocks of a Claude response.
export function read_response_text(response) {
  return response.content
    .filter((content_block) => content_block.type === 'text')
    .map((content_block) => content_block.text)
    .join('');
}

// Checks why Claude stopped and returns the parsed JSON answer. Structured outputs make
// the text valid JSON, but a refusal or a cut-off answer has to be caught first.
export function parse_completion(response) {
  if (response.stop_reason === 'refusal') {
    throw create_http_error(HTTP_STATUS.unprocessable, 'The AI declined to answer this request.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI answer was too long. Try a narrower topic.');
  }
  return JSON.parse(read_response_text(response));
}

// A completer backed by Claude, returning JSON that matches json_schema.
// api_key may be undefined: the SDK then finds credentials itself (ANTHROPIC_API_KEY or
// an `ant auth login` profile). anthropic_client is injectable for tests.
export function create_anthropic_completer({ api_key, model, anthropic_client = new Anthropic({ apiKey: api_key }) }) {
  return async function complete_json({ system_prompt, user_prompt, json_schema }) {
    try {
      const response = await anthropic_client.beta.messages.create({
        model,
        max_tokens: AI_MAX_OUTPUT_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: STUDY_TASK_EFFORT, format: { type: 'json_schema', schema: json_schema } },
        system: system_prompt,
        messages: [{ role: 'user', content: user_prompt }],
      });
      return parse_completion(response);
    } catch (completion_error) {
      throw map_ai_error(completion_error, {
        error_kind: get_sdk_error_kind(completion_error, Anthropic),
        key_variable_name: 'ANTHROPIC_API_KEY',
      });
    }
  };
}
