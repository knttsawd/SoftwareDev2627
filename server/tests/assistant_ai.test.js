import { describe, expect, it, vi } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { normalize_assistant_step, parse_tool_arguments } from '../services/ai/assistant_outputs.js';
import {
  ASSISTANT_RULES,
  build_assistant_json_schema,
  build_assistant_step_request,
  format_assistant_history,
  format_step_results,
} from '../services/ai/assistant_prompts.js';
import { create_chat_assistants, is_provider_available } from '../services/ai/chat_assistants.js';
import { create_llm_ai_provider } from '../services/ai/llm_ai_provider.js';
import {
  build_mock_assistant_step,
  clean_match,
  find_page_path,
  MOCK_ASSISTANT_NOTICE,
  pick_message_skill,
  plan_mock_tool_calls,
  quote_resources,
  read_result,
  split_list_items,
  write_mock_reply,
} from '../services/ai/mock_assistant.js';
import {
  build_assistant_context,
  describe_skill_line,
  describe_widget_line,
  find_page_skill,
  format_local_time,
  format_utc_offset,
} from '../services/assistant/assistant_context.js';
import { create_widget } from '../services/widget_service.js';
import { create_event } from '../services/event_service.js';
import { create_student_with_skill, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';

const NOW = new Date('2026-10-25T13:05:00.000Z');
const SKILLS = [
  { id: 's1', name: 'Biology' },
  { id: 's2', name: 'Maths' },
];
const STEP_REQUEST = {
  tool_names: ['create_skill', 'open_page'],
  tool_catalog: '- create_skill(name: string): Make a skill.',
  context_text: 'Student: Sam.',
  history: [],
  message: 'Make a skill called Chemistry',
  step_results: [],
  step_number: 1,
  max_steps: 5,
  learning_style: null,
  task_tier: 'standard',
};

describe('assistant prompts', () => {
  it('limits tool names to the real tools and keeps arguments as JSON text', () => {
    const json_schema = build_assistant_json_schema(['create_skill']);
    expect(json_schema.properties.tool_calls.items.properties.tool.enum).toEqual(['create_skill']);
    expect(json_schema.properties.tool_calls.items.properties.arguments_json).toEqual({ type: 'string' });
  });

  it('formats the conversation and the results so far', () => {
    expect(format_assistant_history([{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }])).toBe('Student: Hi\n\nAssistant: Hello');
    expect(format_step_results([{ tool: 'create_skill', arguments: { name: 'X' }, result: '{"ok":true}' }])).toBe(
      '1. create_skill {"name":"X"} -> {"ok":true}',
    );
  });

  it('builds a step with the overview, rules, tools and how many steps are left', () => {
    const step_request = build_assistant_step_request(STEP_REQUEST);
    expect(step_request.system_prompt).toMatch(ASSISTANT_RULES);
    expect(step_request.system_prompt).toMatch('Tools:\n- create_skill');
    expect(step_request.user_prompt).toMatch('<overview>\nStudent: Sam.\n</overview>');
    expect(step_request.user_prompt).toMatch('step 1 of at most 5');
    expect(step_request.user_prompt).not.toMatch('<conversation>');
    expect(step_request.task_tier).toBe('standard');

    const last_step = build_assistant_step_request({
      ...STEP_REQUEST,
      step_number: 5,
      learning_style: 'visual',
      history: [{ role: 'user', content: 'Hi' }],
      step_results: [{ tool: 'open_page', arguments: {}, result: '{}' }],
    });
    expect(last_step.user_prompt).toMatch('the last: answer now, without tool calls');
    expect(last_step.user_prompt).toMatch('<conversation>\nStudent: Hi\n</conversation>');
    expect(last_step.user_prompt).toMatch('Results of your tool calls so far:\n1. open_page');
    expect(last_step.system_prompt).toMatch('learns best visually');
  });
});

describe('assistant outputs', () => {
  it('parses tool arguments, flagging anything that is not a JSON object', () => {
    expect(parse_tool_arguments('{"name":"X"}')).toEqual({ arguments: { name: 'X' } });
    expect(parse_tool_arguments('')).toEqual({ arguments: {} });
    expect(parse_tool_arguments(undefined)).toEqual({ arguments: {} });
    expect(parse_tool_arguments('[1]').argument_error).toMatch('JSON object');
    expect(parse_tool_arguments('{oops').argument_error).toMatch('JSON object');
  });

  it('keeps calls to known tools and needs a reply or a call', () => {
    expect(
      normalize_assistant_step(
        { reply_markdown: ' ', tool_calls: [{ tool: 'create_skill', arguments_json: '{"name":"X"}' }, { tool: 'hack', arguments_json: '{}' }] },
        ['create_skill'],
      ),
    ).toEqual({ reply_markdown: '', tool_calls: [{ tool: 'create_skill', arguments: { name: 'X' } }] });
    expect(normalize_assistant_step({ reply_markdown: ' Done. ' }, [])).toEqual({ reply_markdown: 'Done.', tool_calls: [] });
    expect(() => normalize_assistant_step({ reply_markdown: '', tool_calls: [] }, [])).toThrow(expect.objectContaining({ status: 502 }));
  });

  it('runs a step through a real provider', async () => {
    const complete_json = vi.fn().mockResolvedValue({ reply_markdown: 'Hi!', tool_calls: [] });
    const ai_provider = create_llm_ai_provider('test', complete_json);
    expect(await ai_provider.plan_assistant_step(STEP_REQUEST)).toEqual({ reply_markdown: 'Hi!', tool_calls: [] });
    expect(complete_json.mock.calls[0][0].task_tier).toBe('standard');
  });
});

describe('chat assistants (the AI choice)', () => {
  it('offers practice mode, the main provider and providers with keys', () => {
    expect(is_provider_available('mock', { provider: 'mock' })).toBe(true);
    expect(is_provider_available('openai', { provider: 'mock' })).toBe(false);
    expect(is_provider_available('openai', { provider: 'mock', openai_api_key: 'k' })).toBe(true);
    expect(is_provider_available('gemini', { provider: 'gemini' })).toBe(true);
  });

  it('runs steps with the chosen AI and its task tier, falling back to the default', async () => {
    const plan_assistant_step = vi.fn().mockResolvedValue({ reply_markdown: 'ok', tool_calls: [] });
    const chat_assistants = create_chat_assistants({ provider: 'gemini', gemini_api_key: 'k' }, () => ({ plan_assistant_step }));

    expect(chat_assistants.default_id).toBe('gemini-quick');
    expect(chat_assistants.options.map((option) => option.id)).toEqual(['gemini-quick', 'gemini-thorough', 'practice']);
    expect(chat_assistants.resolve_assistant_id('claude')).toBe('gemini-quick');
    await chat_assistants.plan_step('gemini-thorough', { message: 'Hi' });
    expect(plan_assistant_step).toHaveBeenCalledWith({ message: 'Hi', task_tier: 'standard' });
  });
});

describe('practice mode assistant', () => {
  it('finds pages, skills, names and list items in the message', () => {
    expect(find_page_path('the Schedule please')).toBe('/dashboard/schedule');
    expect(find_page_path('nowhere')).toBeNull();
    expect(pick_message_skill('quiz me on maths', SKILLS, 's1').id).toBe('s2');
    expect(pick_message_skill('quiz me', SKILLS, 's2').id).toBe('s2');
    expect(pick_message_skill('quiz me', SKILLS, null).id).toBe('s1');
    expect(pick_message_skill('quiz me', [], null)).toBeNull();
    expect(clean_match(' "Chemistry". ')).toBe('Chemistry');
    expect(split_list_items('read chapter 2, do the quiz and revise.')).toEqual(['read chapter 2', 'do the quiz', 'revise']);
  });

  it('turns simple requests into tool calls', () => {
    const plan = (message, extra = {}) => plan_mock_tool_calls({ message, skills: SKILLS, current_skill_id: 's1', now: NOW, ...extra });
    expect(plan('Take me to the progress page')).toEqual([{ tool: 'open_page', arguments: { path: '/dashboard/progress' } }]);
    expect(plan('Create a new skill called "Chemistry"')).toEqual([{ tool: 'create_skill', arguments: { name: 'Chemistry' } }]);
    expect(plan('Add a topic called Enzymes to Biology')).toEqual([{ tool: 'add_topic', arguments: { skill_id: 's1', topic: 'Enzymes' } }]);
    expect(plan('Quiz me on mitosis')).toEqual([{ tool: 'make_quiz', arguments: { skill_id: 's1', topic: 'mitosis' } }]);
    expect(plan('quiz me')).toEqual([{ tool: 'make_quiz', arguments: { skill_id: 's1', scope: 'skill' } }]);
    expect(plan('Write notes on cells')).toEqual([{ tool: 'make_notes', arguments: { skill_id: 's1', topic: 'cells' } }]);
    expect(plan('Make a checklist: read, revise')[0]).toMatchObject({
      tool: 'create_widget',
      arguments: { kind: 'card', blocks: [{ type: 'checklist', items: ['read', 'revise'] }] },
    });
    expect(plan('Make me a scientific calculator')[0]).toEqual({
      tool: 'create_widget',
      arguments: { title: 'Calculator', kind: 'app', brief: 'Make me a scientific calculator', width: 'medium' },
    });
    expect(plan('build a unit converter please')[0].arguments).toMatchObject({ title: 'Unit converter', kind: 'app' });
    expect(plan('How am I doing?')).toEqual([{ tool: 'get_progress', arguments: {} }]);
    expect(plan("What's on my schedule?")[0]).toEqual({
      tool: 'list_events',
      arguments: { from: NOW.toISOString(), to: '2026-11-01T13:05:00.000Z' },
    });
    expect(plan('What is osmosis?')).toEqual([{ tool: 'search_resources', arguments: { skill_id: 's1', query: 'What is osmosis?' } }]);
    expect(plan('Open the moon')).toEqual([{ tool: 'search_resources', arguments: { skill_id: 's1', query: 'Open the moon' } }]);
    expect(plan('What is osmosis?', { skills: [] })).toEqual([]);
  });

  it('writes the reply from the results', () => {
    expect(read_result('{"ok":true}')).toEqual({ ok: true });
    expect(read_result('{"ok":tr…')).toBeNull();
    expect(quote_resources('Where does photosynthesis happen?', SAMPLE_STUDY_TEXT)).toMatch(/^Here's what your resources say:\n\n- Photosynthesis/);
    expect(quote_resources('zebra', SAMPLE_STUDY_TEXT)).toMatch("couldn't find");

    const reply = write_mock_reply({
      message: 'hi',
      step_results: [
        { tool: 'create_skill', result: '{"ok":true,"summary":"Created.","link":"/dashboard/skill-map?skill=s3"}' },
        { tool: 'get_progress', result: '{"ok":true,"summary":"Checked."}' },
        { tool: 'delete_skill', result: '{"ok":true,"status":"waiting_for_confirmation"}' },
        { tool: 'add_topic', result: '{"ok":false,"error":"Topic is required"}' },
        { tool: 'list_skills', result: 'cut off' },
      ],
    });
    expect(reply).toBe(
      [
        MOCK_ASSISTANT_NOTICE,
        'Created. [Open it](/dashboard/skill-map?skill=s3)',
        'Checked.',
        'Please confirm in the panel to go ahead.',
        "I couldn't do that: Topic is required",
        'Done: list_skills.',
      ].join('\n\n'),
    );
  });

  it('calls tools on the first step and replies on the next', () => {
    const step_request = { message: 'Create a skill called Art', skills: SKILLS, current_skill_id: null, now: NOW, step_results: [] };
    expect(build_mock_assistant_step(step_request).tool_calls).toHaveLength(1);
    expect(build_mock_assistant_step({ ...step_request, step_results: [{ tool: 'create_skill', result: '{"ok":true,"summary":"Made."}' }] })).toEqual({
      reply_markdown: `${MOCK_ASSISTANT_NOTICE}\n\nMade.`,
      tool_calls: [],
    });
    expect(build_mock_assistant_step({ ...step_request, message: 'hello', skills: [] }).reply_markdown).toMatch('Add a skill first');
  });
});

describe('assistant context', () => {
  it('formats the time where the student is', () => {
    expect(format_utc_offset(60)).toBe('+01:00');
    expect(format_utc_offset(-330)).toBe('-05:30');
    expect(format_utc_offset(0)).toBe('+00:00');
    expect(format_local_time(NOW, 60)).toBe('Sunday 2026-10-25T14:05+01:00');
  });

  it('describes the student, page, skills, events and widgets', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id, skill } = await create_student_with_skill(database);
    create_event(database, user_id, { title: 'Exam', starts_at: '2026-10-27T09:00:00.000Z', ends_at: '2026-10-27T10:00:00.000Z', skill_id: skill.id });
    create_widget(database, user_id, { title: 'Countdown', kind: 'card', spec: { blocks: [] }, pinned_paths: ['*'] });

    expect(find_page_skill(database, user_id, `/dashboard/learn?skill=${skill.id}`).id).toBe(skill.id);
    expect(find_page_skill(database, user_id, '/dashboard/learn?skill=nope')).toBeNull();
    expect(find_page_skill(database, user_id, '/dashboard/learn')).toBeNull();
    expect(describe_skill_line({ ...skill, topic_count: 4, weak_topic_count: 1, untested_topic_count: 2, resource_count: 2 })).toBe(
      `- Biology (id ${skill.id}): 4 topics (1 weak, 2 untested), 2 resources`,
    );

    const { context_text, skills, page_skill } = build_assistant_context({
      database,
      user_id,
      page: `/dashboard/skill-map?skill=${skill.id}`,
      utc_offset_minutes: 60,
      now: NOW,
    });
    expect(skills).toHaveLength(1);
    expect(page_skill.id).toBe(skill.id);
    expect(context_text).toMatch('Student: Sam (learning style: not set; focus timer 25 min, break 5 min).');
    expect(context_text).toMatch('Now: Sunday 2026-10-25T14:05+01:00');
    expect(context_text).toMatch(`(skill on this page: Biology, id ${skill.id})`);
    expect(context_text).toMatch(/- Exam \(id .+\): 2026-10-27T09:00:00.000Z to .+, Biology/);
    expect(context_text).toMatch(/- Countdown \(id .+, card, on \*, docked\)/);
    expect(describe_widget_line({ id: 'w1', title: 'Timer', kind: 'card', pinned_paths: [], layout: { mode: 'floating', is_hidden: true } })).toBe(
      '- Timer (id w1, card, not pinned, floating, hidden)',
    );
    expect(context_text).toMatch('/dashboard/learn?skill=<id>&tab=');

    const empty_database = open_database(IN_MEMORY_DATABASE);
    const { user_id: empty_user_id } = await create_student_with_skill(empty_database);
    empty_database.prepare('DELETE FROM skills').run();
    const empty_context = build_assistant_context({ database: empty_database, user_id: empty_user_id, page: '/dashboard', utc_offset_minutes: 0, now: NOW }).context_text;
    expect(empty_context).toMatch('Skills: none yet.');
    expect(empty_context).toMatch('no events.');
    expect(empty_context).toMatch('Widgets: none yet.');
  });
});
