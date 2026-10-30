import { HTTP_STATUS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { clean_text } from './learning_outputs.js';

// Cleans up one step the AI returned: { reply_markdown, tool_calls: [{ tool, arguments,
// argument_error? }] }. Calls to unknown tools are dropped. Arguments that aren't a JSON
// object are kept with argument_error set, so the AI is told and can fix them.

// The parsed arguments of one call: { arguments } or { arguments: {}, argument_error }.
export function parse_tool_arguments(arguments_json) {
  if (typeof arguments_json !== 'string' || arguments_json.trim() === '') return { arguments: {} };
  try {
    const parsed_arguments = JSON.parse(arguments_json);
    if (parsed_arguments && typeof parsed_arguments === 'object' && !Array.isArray(parsed_arguments)) return { arguments: parsed_arguments };
  } catch {
    // Falls through to the error below.
  }
  return { arguments: {}, argument_error: 'arguments_json must be a JSON object, like {"skill_id": "abc"}' };
}

export function normalize_assistant_step(ai_output, tool_names) {
  const tool_calls = (Array.isArray(ai_output?.tool_calls) ? ai_output.tool_calls : [])
    .filter((tool_call) => tool_names.includes(tool_call?.tool))
    .map((tool_call) => ({ tool: tool_call.tool, ...parse_tool_arguments(tool_call.arguments_json) }));
  const reply_markdown = clean_text(ai_output?.reply_markdown);
  if (!reply_markdown && tool_calls.length === 0) {
    throw create_http_error(HTTP_STATUS.bad_gateway, 'The assistant did not answer. Please try again.');
  }
  return { reply_markdown, tool_calls };
}
