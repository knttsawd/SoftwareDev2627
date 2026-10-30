import { randomUUID } from 'node:crypto';
import {
  ASSISTANT_CONTEXT_MESSAGES,
  ASSISTANT_HISTORY_LIMIT,
  ASSISTANT_MAX_STEPS,
  ASSISTANT_MAX_TOOL_CALLS,
  HTTP_STATUS,
} from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { get_learning_style } from '../learning_profile_service.js';
import { build_assistant_context } from './assistant_context.js';
import { ACTION_STATUS, ASSISTANT_TOOL_NAMES, ASSISTANT_TOOLS, describe_tool, execute_tool, find_tool, perform_tool_call } from './tool_registry.js';

// The assistant: one conversation per student, open from any dashboard page. Each message
// is a turn of up to ASSISTANT_MAX_STEPS steps. In each step the chosen AI (chat_assistants)
// either asks for tool calls, which run here with the student's own permissions, or
// answers. What it did is saved with its reply as "actions", which the panel shows.
// Deleting waits for the student's go-ahead (confirm_assistant_action).

const MESSAGE_COLUMNS = 'id, role, content, actions, created_at';
const TOOL_CATALOG = ASSISTANT_TOOLS.map(describe_tool).join('\n');

// An action as the panel sees it (without the arguments it ran with).
export function to_public_action({ arguments: tool_arguments, ...public_action }) {
  return public_action;
}

export function to_public_message(message_row) {
  return { ...message_row, actions: JSON.parse(message_row.actions).map(to_public_action) };
}

// The newest messages, oldest first (rowid breaks ties within one millisecond).
export function list_assistant_messages(database, user_id, limit = ASSISTANT_HISTORY_LIMIT) {
  return database
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM (
         SELECT ${MESSAGE_COLUMNS}, rowid FROM assistant_messages WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
       ) ORDER BY created_at, rowid`,
    )
    .all(user_id, limit);
}

// A saved message as the AI reads it in later turns: the reply plus what was done, with
// links (which hold the ids of things made), so "now quiz me on that" works.
export function to_history_message(message_row) {
  const actions = JSON.parse(message_row.actions);
  if (actions.length === 0) return { role: message_row.role, content: message_row.content };
  const action_lines = actions.map((action) => `${action.label}: ${action.status}${action.summary ? ` (${action.summary})` : ''}${action.link ? ` ${action.link}` : ''}`);
  return { role: message_row.role, content: `${message_row.content}\n[Actions: ${action_lines.join('; ')}]` };
}

// The AI the student picked, if it's still on offer, or the server's default.
export function get_assistant_id(database, chat_assistants, user_id) {
  const user_row = database.prepare('SELECT assistant_id FROM users WHERE id = ?').get(user_id);
  return chat_assistants.resolve_assistant_id(user_row?.assistant_id);
}

// Everything the panel needs on opening: { messages, assistant_id, assistants }.
export function get_assistant_state(database, chat_assistants, user_id) {
  return {
    messages: list_assistant_messages(database, user_id).map(to_public_message),
    assistant_id: get_assistant_id(database, chat_assistants, user_id),
    assistants: chat_assistants.options,
  };
}

// Saves which AI runs the assistant. Returns { assistant_id }.
export function set_assistant_choice(database, chat_assistants, user_id, assistant_id) {
  if (!chat_assistants.options.some((option) => option.id === assistant_id)) {
    throw create_http_error(HTTP_STATUS.bad_request, 'Choose one of the AIs in the list', {
      field_errors: { assistant_id: 'Choose one of the AIs in the list' },
    });
  }
  database.prepare('UPDATE users SET assistant_id = ? WHERE id = ?').run(assistant_id, user_id);
  return { assistant_id };
}

export function clear_assistant_messages(database, user_id) {
  database.prepare('DELETE FROM assistant_messages WHERE user_id = ?').run(user_id);
}

// Saves the student's message and the reply (with its actions) together. Returns both, public.
export function save_assistant_exchange(database, user_id, message, reply_markdown, actions) {
  const insert_message = database.prepare('INSERT INTO assistant_messages (id, user_id, role, content, actions) VALUES (?, ?, ?, ?, ?)');
  const user_message_id = randomUUID();
  const assistant_message_id = randomUUID();
  database.exec('BEGIN');
  try {
    insert_message.run(user_message_id, user_id, 'user', message, '[]');
    insert_message.run(assistant_message_id, user_id, 'assistant', reply_markdown, JSON.stringify(actions));
    database.exec('COMMIT');
  } catch (save_error) {
    database.exec('ROLLBACK');
    throw save_error;
  }
  const read_message = database.prepare(`SELECT ${MESSAGE_COLUMNS} FROM assistant_messages WHERE id = ?`);
  return { user_message: to_public_message(read_message.get(user_message_id)), assistant_message: to_public_message(read_message.get(assistant_message_id)) };
}

// A plain reply listing what was done, for when the AI stopped before answering.
export function describe_actions(actions) {
  if (actions.length === 0) return "I couldn't finish that. Please try again.";
  return ['Here is what I did:', ...actions.map((action) => `- ${action.label}: ${action.summary ?? action.status}`)].join('\n');
}

// One message from the student, worked through in steps. request: { database, ai_provider,
// chat_assistants, resource_importer, uploads_path, user_id, message, page,
// utc_offset_minutes, now }. Returns { user_message, assistant_message, client_actions,
// data_changed }. If the AI fails part-way, what was already done is still saved and
// reported, so nothing happens silently; if it fails before doing anything, the error is
// passed on and nothing is saved.
export async function run_assistant_turn(request) {
  const { database, chat_assistants, user_id, message, page, utc_offset_minutes, now = new Date() } = request;
  const { context_text, skills, page_skill } = build_assistant_context({ database, user_id, page, utc_offset_minutes, now });
  const tool_context = { ...request, now };
  const assistant_id = get_assistant_id(database, chat_assistants, user_id);
  const base_step_request = {
    tool_names: ASSISTANT_TOOL_NAMES,
    tool_catalog: TOOL_CATALOG,
    context_text,
    history: list_assistant_messages(database, user_id, ASSISTANT_CONTEXT_MESSAGES).map(to_history_message),
    message,
    max_steps: ASSISTANT_MAX_STEPS,
    learning_style: get_learning_style(database, user_id),
    skills,
    current_skill_id: page_skill?.id ?? null,
    now,
  };

  const actions = [];
  const step_results = [];
  const client_actions = [];
  let data_changed = false;
  let reply_markdown = '';
  try {
    for (let step_number = 1; step_number <= ASSISTANT_MAX_STEPS; step_number += 1) {
      const step = await chat_assistants.plan_step(assistant_id, { ...base_step_request, step_results: [...step_results], step_number });
      reply_markdown = step.reply_markdown;
      if (step.tool_calls.length === 0) break;
      for (const tool_call of step.tool_calls.slice(0, ASSISTANT_MAX_TOOL_CALLS)) {
        const outcome = await perform_tool_call(tool_call, tool_context);
        if (outcome.action) actions.push(outcome.action);
        if (outcome.client_action) client_actions.push(outcome.client_action);
        data_changed ||= outcome.changes_data;
        step_results.push({ tool: tool_call.tool, arguments: tool_call.arguments, result: outcome.result_for_ai });
      }
      if (step_number === ASSISTANT_MAX_STEPS) reply_markdown ||= describe_actions(actions);
    }
  } catch (step_error) {
    if (actions.length === 0) throw step_error;
    reply_markdown = `${step_error.message}\n\n${describe_actions(actions)}`;
  }

  const exchange = save_assistant_exchange(database, user_id, message, reply_markdown || describe_actions(actions), actions);
  return { ...exchange, client_actions, data_changed };
}

// The student's assistant message and its pending action, or a 404 / 409.
function find_pending_action(database, user_id, message_id, action_id) {
  const message_row = database
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM assistant_messages WHERE id = ? AND user_id = ? AND role = 'assistant'`)
    .get(message_id, user_id);
  const actions = message_row ? JSON.parse(message_row.actions) : [];
  const action = actions.find((candidate) => candidate.id === action_id);
  if (!action) throw create_http_error(HTTP_STATUS.not_found, 'Action not found');
  if (action.status !== ACTION_STATUS.pending) throw create_http_error(HTTP_STATUS.conflict, 'That has already been confirmed or cancelled.');
  return { message_row, actions, action };
}

function save_actions(database, message_row, actions) {
  database.prepare('UPDATE assistant_messages SET actions = ? WHERE id = ?').run(JSON.stringify(actions), message_row.id);
  return to_public_message({ ...message_row, actions: JSON.stringify(actions) });
}

// Runs a pending action the student confirmed. request: { database, ai_provider,
// resource_importer, uploads_path, user_id, message_id, action_id, now }. Returns
// { message, client_actions, data_changed }.
export async function confirm_assistant_action(request) {
  const { database, user_id, message_id, action_id, now = new Date() } = request;
  const { message_row, actions, action } = find_pending_action(database, user_id, message_id, action_id);
  const outcome = await execute_tool(find_tool(action.tool), action.arguments, { ...request, now });
  Object.assign(action, outcome.action_fields);
  return {
    message: save_actions(database, message_row, actions),
    client_actions: outcome.client_action ? [outcome.client_action] : [],
    data_changed: outcome.changes_data,
  };
}

// Leaves a pending action undone. Returns { message }.
export function cancel_assistant_action({ database, user_id, message_id, action_id }) {
  const { message_row, actions, action } = find_pending_action(database, user_id, message_id, action_id);
  Object.assign(action, { status: ACTION_STATUS.cancelled, summary: 'Cancelled' });
  return { message: save_actions(database, message_row, actions) };
}
