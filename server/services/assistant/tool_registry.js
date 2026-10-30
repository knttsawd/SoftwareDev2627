import { randomUUID } from 'node:crypto';
import { ASSISTANT_TOOL_RESULT_CHARACTERS } from '../../config/constants.js';
import { LEARNING_TOOLS } from './learning_tools.js';
import { PLANNING_TOOLS } from './planning_tools.js';
import { STUDY_TOOLS } from './study_tools.js';
import { cut_text } from './tool_helpers.js';
import { WIDGET_TOOLS } from './widget_tools.js';

// Every tool the assistant can call, and running one call. A call's outcome has three
// audiences: the panel (an "action" with a label and status), the AI (the result it reads
// in its next step) and the browser (client_action, like opening a page).

export const ASSISTANT_TOOLS = [...STUDY_TOOLS, ...LEARNING_TOOLS, ...PLANNING_TOOLS, ...WIDGET_TOOLS];
export const ASSISTANT_TOOL_NAMES = ASSISTANT_TOOLS.map((tool) => tool.name);
export const ACTION_STATUS = { done: 'done', failed: 'failed', pending: 'pending', cancelled: 'cancelled' };

export function find_tool(tool_name, tools = ASSISTANT_TOOLS) {
  return tools.find((tool) => tool.name === tool_name) ?? null;
}

// One line per tool for the AI: "name(param: details; ...): what it does [...]".
export function describe_tool(tool) {
  const parameter_text = Object.entries(tool.parameters)
    .map(([parameter_name, details]) => `${parameter_name}: ${details}`)
    .join('; ');
  const confirmation_note = tool.needs_confirmation ? ' [The student confirms in the panel before it happens.]' : '';
  return `- ${tool.name}(${parameter_text}): ${tool.description}${confirmation_note}`;
}

// The tool's label for the panel. A label that can't be made falls back to the tool's name.
export function make_label(tool, args, context) {
  try {
    return tool.label(args, context);
  } catch {
    return tool.name;
  }
}

// What the AI reads back: the outcome as compact JSON, cut to a sensible length.
export function format_result_for_ai(result) {
  return cut_text(JSON.stringify(result), ASSISTANT_TOOL_RESULT_CHARACTERS);
}

// Runs a tool now and describes the outcome. Errors (a bad argument, a missing item, the
// AI being busy) become a failed action, so the assistant can explain or try again.
export async function execute_tool(tool, args, context) {
  try {
    const result = await tool.run(context, args);
    return {
      action_fields: { status: ACTION_STATUS.done, summary: result.summary, link: result.link ?? null, widget_id: result.widget_id ?? null },
      result_for_ai: format_result_for_ai({ ok: true, summary: result.summary, link: result.link, data: result.data }),
      client_action: result.client_action ?? null,
      changes_data: tool.effect === 'write',
    };
  } catch (tool_error) {
    const message = tool_error.is_http_error ? tool_error.message : 'That action failed unexpectedly.';
    return {
      action_fields: { status: ACTION_STATUS.failed, summary: message, link: null, widget_id: null },
      result_for_ai: format_result_for_ai({ ok: false, error: message }),
      client_action: null,
      changes_data: false,
    };
  }
}

// One call the AI asked for ({ tool, arguments }). Tools that need the student's go-ahead
// are recorded as pending instead of run. Returns { action, result_for_ai, client_action,
// changes_data }, where action is what the panel shows (with the arguments, kept so a
// pending one can run later).
export async function perform_tool_call(tool_call, context, tools = ASSISTANT_TOOLS) {
  const tool = find_tool(tool_call.tool, tools);
  const call_error = tool ? tool_call.argument_error : `There is no tool called ${tool_call.tool}`;
  if (call_error) {
    return { action: null, result_for_ai: format_result_for_ai({ ok: false, error: call_error }), client_action: null, changes_data: false };
  }
  const action_base = { id: randomUUID(), tool: tool.name, arguments: tool_call.arguments, label: make_label(tool, tool_call.arguments, context) };
  if (tool.needs_confirmation) {
    return {
      action: { ...action_base, status: ACTION_STATUS.pending, summary: 'Waiting for you to confirm', link: null, widget_id: null },
      result_for_ai: format_result_for_ai({ ok: true, status: 'waiting_for_confirmation', note: 'Not done yet: the student must press Confirm in the panel.' }),
      client_action: null,
      changes_data: false,
    };
  }
  const outcome = await execute_tool(tool, tool_call.arguments, context);
  return { action: { ...action_base, ...outcome.action_fields }, result_for_ai: outcome.result_for_ai, client_action: outcome.client_action, changes_data: outcome.changes_data };
}
