import { HTTP_STATUS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';

// The kinds of AI failure the student gets a specific message for.
export const AI_ERROR_KIND = { auth: 'auth', busy: 'busy', other: 'other' };

// Sorts an Anthropic or OpenAI SDK error by its class. error_classes is the SDK's default
// export, which carries AuthenticationError and RateLimitError.
export function get_sdk_error_kind(ai_error, error_classes) {
  if (ai_error instanceof error_classes.AuthenticationError) return AI_ERROR_KIND.auth;
  if (ai_error instanceof error_classes.RateLimitError) return AI_ERROR_KIND.busy;
  return AI_ERROR_KIND.other;
}

// Turns an AI provider's error into a message the student can act on, keeping the original
// as the cause so the server log shows it. error_kind comes from the provider's own sorting
// (get_sdk_error_kind, get_gemini_error_kind); key_variable_name is the .env setting to fix
// when the API key is rejected. Errors that are already http errors pass straight through.
export function map_ai_error(ai_error, { error_kind, key_variable_name }) {
  if (ai_error?.is_http_error) return ai_error;
  if (error_kind === AI_ERROR_KIND.auth) {
    return create_http_error(
      HTTP_STATUS.bad_gateway,
      `The AI provider rejected the API key. Check ${key_variable_name} in server/.env.`,
      {},
      ai_error,
    );
  }
  if (error_kind === AI_ERROR_KIND.busy) {
    return create_http_error(
      HTTP_STATUS.service_unavailable,
      'The AI is busy right now. Please try again in a minute.',
      {},
      ai_error,
    );
  }
  return create_http_error(HTTP_STATUS.bad_gateway, 'The AI service could not answer. Please try again.', {}, ai_error);
}
