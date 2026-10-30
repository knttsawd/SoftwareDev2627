import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { create_app } from '../app.js';
import { ASSISTANT_MAX_STEPS, IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import {
  cancel_assistant_action,
  clear_assistant_messages,
  confirm_assistant_action,
  describe_actions,
  get_assistant_id,
  get_assistant_state,
  list_assistant_messages,
  run_assistant_turn,
  save_assistant_exchange,
  set_assistant_choice,
  to_history_message,
  to_public_action,
} from '../services/assistant/assistant_service.js';
import { validate_assistant_input } from '../services/assistant/assistant_validators.js';
import { create_http_error } from '../services/http_error.js';
import { list_skills } from '../services/skill_service.js';
import { create_student_with_skill, insert_test_resource, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

const NOW = new Date('2026-10-25T13:00:00.000Z');
const OPTIONS = [
  { id: 'quick', label: 'Quick', description: 'Fast.' },
  { id: 'practice', label: 'Practice', description: 'Free.' },
];

// A chat_assistants stand-in whose steps are scripted: each call to plan_step returns the
// next of steps (or throws it, if it's an Error).
function create_scripted_assistants(steps) {
  const plan_step = vi.fn(async () => {
    const step = steps.shift() ?? { reply_markdown: 'Done.', tool_calls: [] };
    if (step instanceof Error) throw step;
    return step;
  });
  return { options: OPTIONS, default_id: 'quick', resolve_assistant_id: (id) => (OPTIONS.some((option) => option.id === id) ? id : 'quick'), plan_step };
}

async function create_student() {
  const database = open_database(IN_MEMORY_DATABASE);
  const { user_id, skill } = await create_student_with_skill(database);
  return { database, user_id, skill };
}

function run_turn(database, user_id, chat_assistants, message = 'Hi') {
  return run_assistant_turn({
    database,
    ai_provider: create_mock_ai_provider(),
    chat_assistants,
    resource_importer: null,
    uploads_path: '.',
    user_id,
    message,
    page: '/dashboard/learn',
    utc_offset_minutes: 60,
    now: NOW,
  });
}

describe('assistant messages', () => {
  it('validates a message, its page and the time zone offset', () => {
    expect(validate_assistant_input({ message: ' Hi ' })).toEqual({ field_errors: {}, values: { message: 'Hi', page: '/dashboard', utc_offset_minutes: 0 } });
    expect(validate_assistant_input({ message: 'x'.repeat(4001), page: 'learn', utc_offset_minutes: 2000 }).field_errors).toEqual({
      message: 'Keep messages under 4000 characters',
      page: 'page must be the address of the current page',
      utc_offset_minutes: 'utc_offset_minutes must be a whole number of minutes',
    });
    expect(validate_assistant_input({}).field_errors.message).toBe('Type a message first');
  });

  it('saves exchanges, hides action arguments, and lists the newest messages oldest first', async () => {
    const { database, user_id } = await create_student();
    const action = { id: 'a1', tool: 'create_skill', arguments: { name: 'X' }, label: 'Create X', status: 'done', summary: 'Made X.', link: '/dashboard/skill-map', widget_id: null };
    const exchange = save_assistant_exchange(database, user_id, 'Make X', 'Done!', [action]);
    save_assistant_exchange(database, user_id, 'Second', 'Okay', []);

    expect(exchange.assistant_message.actions).toEqual([to_public_action(action)]);
    expect(exchange.assistant_message.actions[0]).not.toHaveProperty('arguments');
    expect(list_assistant_messages(database, user_id, 2).map((message_row) => message_row.content)).toEqual(['Second', 'Okay']);
    expect(to_history_message(list_assistant_messages(database, user_id)[1])).toEqual({
      role: 'assistant',
      content: 'Done!\n[Actions: Create X: done (Made X.) /dashboard/skill-map]',
    });
    expect(to_history_message({ role: 'user', content: 'Hi', actions: '[]' })).toEqual({ role: 'user', content: 'Hi' });
    clear_assistant_messages(database, user_id);
    expect(list_assistant_messages(database, user_id)).toEqual([]);
  });

  it('remembers the chosen AI, falling back to the default', async () => {
    const { database, user_id } = await create_student();
    const chat_assistants = create_scripted_assistants([]);
    expect(get_assistant_state(database, chat_assistants, user_id)).toEqual({ messages: [], assistant_id: 'quick', assistants: OPTIONS });
    expect(set_assistant_choice(database, chat_assistants, user_id, 'practice')).toEqual({ assistant_id: 'practice' });
    expect(get_assistant_id(database, chat_assistants, user_id)).toBe('practice');
    expect(() => set_assistant_choice(database, chat_assistants, user_id, 'nope')).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('describes what was done when there is no reply', () => {
    expect(describe_actions([])).toMatch("couldn't finish");
    expect(describe_actions([{ label: 'Create X', summary: 'Made X.' }, { label: 'Delete Y', status: 'pending' }])).toBe(
      'Here is what I did:\n- Create X: Made X.\n- Delete Y: pending',
    );
  });
});

describe('run_assistant_turn', () => {
  it('runs tool calls, feeds the results back, and saves the reply with its actions', async () => {
    const { database, user_id, skill } = await create_student();
    const chat_assistants = create_scripted_assistants([
      {
        reply_markdown: '',
        tool_calls: [
          { tool: 'create_skill', arguments: { name: 'Chemistry' } },
          { tool: 'open_page', arguments: { path: '/dashboard/skill-map' } },
        ],
      },
      { reply_markdown: 'Made **Chemistry**.', tool_calls: [] },
    ]);

    const turn = await run_turn(database, user_id, chat_assistants, 'Make a Chemistry skill and show me');

    expect(turn.assistant_message.content).toBe('Made **Chemistry**.');
    expect(turn.assistant_message.actions.map((action) => [action.tool, action.status])).toEqual([
      ['create_skill', 'done'],
      ['open_page', 'done'],
    ]);
    expect(turn.client_actions).toEqual([{ type: 'navigate', path: '/dashboard/skill-map' }]);
    expect(turn.data_changed).toBe(true);
    expect(list_skills(database, user_id).map((listed_skill) => listed_skill.name)).toEqual(['Biology', 'Chemistry']);

    const [first_step, second_step] = chat_assistants.plan_step.mock.calls.map((call) => call[1]);
    expect(first_step).toMatchObject({ message: 'Make a Chemistry skill and show me', step_number: 1, step_results: [], max_steps: ASSISTANT_MAX_STEPS });
    expect(first_step.context_text).toMatch(`Biology (id ${skill.id})`);
    expect(first_step.tool_catalog).toMatch('- create_widget(');
    expect(second_step.step_results.map((step_result) => step_result.tool)).toEqual(['create_skill', 'open_page']);
    expect(second_step.step_results[0].result).toMatch('"ok":true');
  });

  it('includes the earlier conversation, and the page skill for practice mode', async () => {
    const { database, user_id, skill } = await create_student();
    save_assistant_exchange(database, user_id, 'Earlier question', 'Earlier answer', []);
    const chat_assistants = create_scripted_assistants([{ reply_markdown: 'Hi!', tool_calls: [] }]);
    await run_assistant_turn({
      database,
      chat_assistants,
      user_id,
      message: 'Hello',
      page: `/dashboard/learn?skill=${skill.id}`,
      utc_offset_minutes: 0,
      now: NOW,
    });
    const step_request = chat_assistants.plan_step.mock.calls[0][1];
    expect(step_request.history.map((history_message) => history_message.content)).toEqual(['Earlier question', 'Earlier answer']);
    expect(step_request.current_skill_id).toBe(skill.id);
    expect(step_request.skills).toHaveLength(1);
  });

  it('stops after the last step and lists what it did', async () => {
    const { database, user_id } = await create_student();
    const looping_step = { reply_markdown: '', tool_calls: [{ tool: 'list_skills', arguments: {} }] };
    const chat_assistants = create_scripted_assistants(Array.from({ length: ASSISTANT_MAX_STEPS }, () => ({ ...looping_step })));

    const turn = await run_turn(database, user_id, chat_assistants);

    expect(chat_assistants.plan_step).toHaveBeenCalledTimes(ASSISTANT_MAX_STEPS);
    expect(turn.assistant_message.content).toMatch(/^Here is what I did:\n- Look at your skills: 1 skill/);
    expect(turn.data_changed).toBe(false);
  });

  it('saves what was done when the AI fails part-way, and saves nothing when it fails first', async () => {
    const { database, user_id } = await create_student();
    const part_way = create_scripted_assistants([
      { reply_markdown: '', tool_calls: [{ tool: 'create_skill', arguments: { name: 'Art' } }] },
      create_http_error(503, 'The AI is busy right now.'),
    ]);
    const turn = await run_turn(database, user_id, part_way);
    expect(turn.assistant_message.content).toMatch(/^The AI is busy right now\.\n\nHere is what I did:\n- Create the skill "Art"/);

    const at_once = create_scripted_assistants([create_http_error(503, 'The AI is busy right now.')]);
    await expect(run_turn(database, user_id, at_once)).rejects.toMatchObject({ status: 503 });
    expect(list_assistant_messages(database, user_id)).toHaveLength(2);
  });

  it('holds deletes until the student confirms or cancels', async () => {
    const { database, user_id, skill } = await create_student();
    const chat_assistants = create_scripted_assistants([
      { reply_markdown: '', tool_calls: [{ tool: 'delete_skill', arguments: { skill_id: skill.id } }, { tool: 'delete_skill', arguments: { skill_id: skill.id } }] },
      { reply_markdown: 'Please confirm.', tool_calls: [] },
    ]);
    const turn = await run_turn(database, user_id, chat_assistants);
    const [first_action, second_action] = turn.assistant_message.actions;
    expect(first_action.status).toBe('pending');
    expect(list_skills(database, user_id)).toHaveLength(1);

    const cancelled = cancel_assistant_action({ database, user_id, message_id: turn.assistant_message.id, action_id: second_action.id });
    expect(cancelled.message.actions[1]).toMatchObject({ status: 'cancelled', summary: 'Cancelled' });

    const confirmed = await confirm_assistant_action({ database, uploads_path: '.', user_id, message_id: turn.assistant_message.id, action_id: first_action.id });
    expect(confirmed.message.actions[0]).toMatchObject({ status: 'done', summary: 'Deleted the skill "Biology".' });
    expect(confirmed).toMatchObject({ client_actions: [], data_changed: true });
    expect(list_skills(database, user_id)).toHaveLength(0);

    await expect(confirm_assistant_action({ database, user_id, message_id: turn.assistant_message.id, action_id: first_action.id })).rejects.toMatchObject({ status: 409 });
    expect(() => cancel_assistant_action({ database, user_id, message_id: turn.assistant_message.id, action_id: 'nope' })).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => cancel_assistant_action({ database, user_id: 'someone-else', message_id: turn.assistant_message.id, action_id: first_action.id })).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });
});

describe('assistant routes', () => {
  it('chats in practice mode, acts, and confirms through the API', async () => {
    const app = create_app({ database: open_database(IN_MEMORY_DATABASE), uploads_path: '.', client_origin: '', ai_provider: create_mock_ai_provider(), transcriber: null });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);

    const opened = await as_student('get', '/api/assistant');
    expect(opened.body).toMatchObject({ messages: [], assistant_id: 'practice' });
    expect((await as_student('post', '/api/assistant/messages').send({ message: '' })).status).toBe(400);

    const created = await as_student('post', '/api/assistant/messages').send({ message: 'Create a skill called Biology', page: '/dashboard/progress', utc_offset_minutes: 60 });
    expect(created.status).toBe(201);
    expect(created.body.assistant_message.content).toMatch('Created the skill "Biology".');
    expect(created.body.data_changed).toBe(true);
    const skill = (await as_student('get', '/api/skills')).body[0];
    await as_student('post', `/api/skills/${skill.id}/resources/text`).send({ title: 'Notes', text: SAMPLE_STUDY_TEXT });

    const answered = await as_student('post', '/api/assistant/messages').send({ message: 'Where does chlorophyll absorb light?', page: `/dashboard/learn?skill=${skill.id}` });
    expect(answered.body.assistant_message.content).toMatch("Here's what your resources say");
    const opened_page = await as_student('post', '/api/assistant/messages').send({ message: 'Open my schedule' });
    expect(opened_page.body.client_actions).toEqual([{ type: 'navigate', path: '/dashboard/schedule' }]);

    expect((await as_student('put', '/api/assistant/settings').send({ assistant_id: 'nope' })).status).toBe(400);
    expect((await as_student('put', '/api/assistant/settings').send({ assistant_id: 'practice' })).body).toEqual({ assistant_id: 'practice' });
    expect((await as_student('get', '/api/assistant')).body.messages).toHaveLength(6);
    expect((await as_student('delete', '/api/assistant/messages')).status).toBe(204);
    expect((await as_student('get', '/api/assistant')).body.messages).toEqual([]);
  });

  it('confirms and cancels pending actions through the API', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const chat_assistants = create_scripted_assistants([]);
    const app = create_app({ database, uploads_path: '.', client_origin: '', ai_provider: create_mock_ai_provider(), transcriber: null, chat_assistants });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);
    const skill = (await as_student('post', '/api/skills').send({ name: 'Biology' })).body;
    insert_test_resource(database, { user_id: database.prepare('SELECT id FROM users').get().id, skill_id: skill.id });
    chat_assistants.plan_step
      .mockResolvedValueOnce({ reply_markdown: '', tool_calls: [{ tool: 'delete_skill', arguments: { skill_id: skill.id } }, { tool: 'delete_skill', arguments: { skill_id: skill.id } }] })
      .mockResolvedValueOnce({ reply_markdown: 'Confirm, please.', tool_calls: [] });

    const turn = (await as_student('post', '/api/assistant/messages').send({ message: 'Delete Biology' })).body;
    const [first_action, second_action] = turn.assistant_message.actions;
    const actions_url = `/api/assistant/messages/${turn.assistant_message.id}/actions`;
    expect((await as_student('post', `${actions_url}/${second_action.id}/cancel`)).body.message.actions[1].status).toBe('cancelled');
    expect((await as_student('post', `${actions_url}/${first_action.id}/confirm`)).body.message.actions[0].status).toBe('done');
    expect((await as_student('post', `${actions_url}/${first_action.id}/confirm`)).status).toBe(409);
    expect((await as_student('get', '/api/skills')).body).toEqual([]);
  });
});
