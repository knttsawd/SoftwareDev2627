import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { APP_BUILD_ATTEMPTS, IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { create_mock_transcriber } from '../services/ai/ai_providers.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import { CALCULATOR_APP, CONVERTER_APP } from '../services/ai/widget_app_examples.js';
import { ASSISTANT_SETTING_FIELDS } from '../services/assistant/planning_tools.js';
import { name_resource, name_topic, skill_map_link, to_tool_topic } from '../services/assistant/study_tools.js';
import { count_words, cut_text, name_skill, pick_sent, require_skill, take_values } from '../services/assistant/tool_helpers.js';
import {
  ACTION_STATUS,
  ASSISTANT_TOOL_NAMES,
  ASSISTANT_TOOLS,
  describe_tool,
  execute_tool,
  find_tool,
  format_result_for_ai,
  make_label,
  perform_tool_call,
} from '../services/assistant/tool_registry.js';
import { build_app_spec, WIDGET_GUIDE } from '../services/assistant/widget_tools.js';
import { create_http_error } from '../services/http_error.js';
import { create_resource_importer } from '../services/resource_importer.js';
import { get_owned_widget } from '../services/widget_service.js';
import { APP_BLOCKED_CODE } from '../services/widget_specs.js';
import { get_owned_stack } from '../services/widget_stack_service.js';
import { create_student_with_skill, insert_test_resource, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';

const NOW = new Date('2026-10-25T13:00:00.000Z');

// A student with Biology (one resource) and everything the tools need.
async function create_tool_context() {
  const database = open_database(IN_MEMORY_DATABASE);
  const uploads_path = mkdtempSync(path.join(tmpdir(), 'studyapp-tools-'));
  const { user_id, skill } = await create_student_with_skill(database);
  const resource_id = insert_test_resource(database, { user_id, skill_id: skill.id });
  const context = {
    database,
    ai_provider: create_mock_ai_provider(),
    resource_importer: create_resource_importer({ database, uploads_path, transcriber: create_mock_transcriber() }),
    uploads_path,
    user_id,
    now: NOW,
  };
  return { context, skill, resource_id };
}

// Runs one tool call and returns its outcome; fails the test if the tool failed.
async function call_tool(context, tool, args) {
  const outcome = await perform_tool_call({ tool, arguments: args }, context);
  expect(outcome.action?.status, `${tool}: ${outcome.action?.summary}`).not.toBe(ACTION_STATUS.failed);
  return outcome;
}

describe('tool helpers', () => {
  it('take values or report every problem', () => {
    expect(take_values({ field_errors: {}, values: { a: 1 } })).toEqual({ a: 1 });
    expect(() => take_values({ field_errors: { name: 'Name is required', color: 'Bad color' }, values: {} })).toThrow(
      expect.objectContaining({ status: 400, message: 'name: Name is required; color: Bad color' }),
    );
  });

  it('cut text, pick sent fields and count', () => {
    expect(cut_text('abcdef', 3)).toBe('abc…');
    expect(cut_text('ab', 3)).toBe('ab');
    expect(cut_text(null, 3)).toBe('');
    expect(pick_sent({ a: 1, b: undefined, c: null }, ['a', 'b', 'c'])).toEqual({ a: 1, c: null });
    expect(count_words(1, 'quiz', 'quizzes')).toBe('1 quiz');
    expect(count_words(2, 'quiz', 'quizzes')).toBe('2 quizzes');
    expect(count_words(0, 'topic')).toBe('0 topics');
  });

  it('find skills, topics and resources by id, and name them for labels', async () => {
    const { context, skill, resource_id } = await create_tool_context();
    expect(require_skill(context, skill.id).name).toBe('Biology');
    expect(() => require_skill(context, '')).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => require_skill(context, 'nope')).toThrow(expect.objectContaining({ status: 404 }));
    expect(name_skill(context, skill.id)).toBe('"Biology"');
    expect(name_skill(context, 'nope')).toBe('nope');
    expect(name_topic(context, 'nope')).toBe('nope');
    expect(name_resource(context, resource_id)).toBe('"Chapter 1"');
    expect(name_resource(context, 'nope')).toBe('nope');
    expect(skill_map_link('s1')).toBe('/dashboard/skill-map?skill=s1');
    expect(to_tool_topic({ id: 't', topic: 'T', parent_node_id: null, summary: '', mastery_level: 'weak', mastery_score: 20, resource_count: 0, extra: 1 })).not.toHaveProperty('extra');
  });
});

describe('tool registry', () => {
  it('has a unique name, a description and a label for every tool', () => {
    expect(new Set(ASSISTANT_TOOL_NAMES).size).toBe(ASSISTANT_TOOLS.length);
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(10);
      expect(['read', 'write', 'navigate']).toContain(tool.effect);
    }
    expect(find_tool('create_skill').name).toBe('create_skill');
    expect(find_tool('nope')).toBeNull();
  });

  it('describes tools for the AI, marking the ones that need confirming', () => {
    expect(describe_tool(find_tool('delete_skill'))).toBe(
      '- delete_skill(skill_id: string, required): Delete a skill with all its topics, resources, notes, quizzes, lessons and key terms. The student must confirm. [The student confirms in the panel before it happens.]',
    );
    expect(describe_tool(find_tool('list_skills'))).toMatch(/^- list_skills\(\): /);
    expect(WIDGET_GUIDE).toMatch('you write a brief, not code');
    expect(WIDGET_GUIDE).toMatch('13 categories');
  });

  it('falls back to the tool name for a label, and cuts long results', () => {
    expect(make_label({ name: 'x', label: () => { throw new Error('no'); } }, {}, {})).toBe('x');
    expect(format_result_for_ai({ text: 'a'.repeat(5000) }).length).toBeLessThan(4100);
  });

  it('turns errors into failed actions the AI can read', async () => {
    const known_error = await execute_tool({ effect: 'write', run: () => { throw create_http_error(400, 'Name is required'); } }, {}, {});
    expect(known_error.action_fields).toMatchObject({ status: 'failed', summary: 'Name is required' });
    expect(known_error.result_for_ai).toBe('{"ok":false,"error":"Name is required"}');
    const surprise = await execute_tool({ effect: 'write', run: () => { throw new Error('secret detail'); } }, {}, {});
    expect(surprise.action_fields.summary).toBe('That action failed unexpectedly.');
    expect(surprise.changes_data).toBe(false);
  });

  it('reports unknown tools and bad arguments without an action, and holds deletes for confirmation', async () => {
    const { context, skill } = await create_tool_context();
    expect(await perform_tool_call({ tool: 'nope', arguments: {} }, context)).toMatchObject({ action: null, result_for_ai: expect.stringContaining('no tool called nope') });
    expect((await perform_tool_call({ tool: 'list_skills', arguments: {}, argument_error: 'bad json' }, context)).result_for_ai).toMatch('bad json');

    const pending = await perform_tool_call({ tool: 'delete_skill', arguments: { skill_id: skill.id } }, context);
    expect(pending.action).toMatchObject({ status: 'pending', label: 'Delete the skill "Biology" and everything in it', arguments: { skill_id: skill.id } });
    expect(pending.changes_data).toBe(false);
    expect(require_skill(context, skill.id)).toBeTruthy();
  });
});

describe('every tool', () => {
  it('works with skills, topics and resources', async () => {
    const { context, skill, resource_id } = await create_tool_context();
    expect((await call_tool(context, 'list_skills', {})).action.summary).toBe('1 skill');
    const created = await call_tool(context, 'create_skill', { name: 'Chemistry', color: '#0EA5E9' });
    expect(created).toMatchObject({ changes_data: true, action: { summary: 'Created the skill "Chemistry".', link: expect.stringContaining('/dashboard/skill-map?skill=') } });
    const chemistry_id = JSON.parse(created.result_for_ai).data.id;
    expect((await call_tool(context, 'update_skill', { skill_id: chemistry_id, name: 'Chem' })).action.summary).toBe('Updated the skill "Chem".');
    expect((await perform_tool_call({ tool: 'update_skill', arguments: { skill_id: chemistry_id } }, context)).action.status).toBe('failed');

    const topic = JSON.parse((await call_tool(context, 'add_topic', { skill_id: skill.id, topic: 'Cells' })).result_for_ai).data;
    expect((await call_tool(context, 'update_topic', { topic_id: topic.id, topic: 'Cell biology' })).action.summary).toBe('Updated the topic "Cell biology".');
    expect((await call_tool(context, 'get_topic_map', { skill_id: skill.id })).action.summary).toBe('1 topic');
    expect((await call_tool(context, 'find_topics', { skill_id: skill.id })).action.summary).toMatch(/^Added \d+ topics? to Biology\.$/);
    expect((await call_tool(context, 'break_down_topic', { topic_id: topic.id })).action.summary).toMatch(/subtopics? under "Cell biology"/);

    expect((await call_tool(context, 'list_resources', { skill_id: skill.id })).action.summary).toBe('1 resource');
    const search = JSON.parse((await call_tool(context, 'search_resources', { skill_id: skill.id, query: 'chlorophyll' })).result_for_ai);
    expect(search.data.excerpts).toMatch('Chlorophyll');
    const empty_search = await call_tool(context, 'search_resources', { skill_id: chemistry_id, query: 'x' });
    expect(empty_search.action.summary).toBe('Chem has no resources yet.');
    const reading = JSON.parse((await call_tool(context, 'read_resource', { resource_id, start: 10 })).result_for_ai).data;
    expect(reading).toMatchObject({ title: 'Chapter 1', total_characters: SAMPLE_STUDY_TEXT.length, next_start: null });
    expect(reading.text).toBe(SAMPLE_STUDY_TEXT.slice(10));

    const note = await call_tool(context, 'add_note_resource', { skill_id: skill.id, title: 'My notes', text: 'Osmosis moves water across membranes.', topic_id: topic.id });
    expect(note.action.summary).toBe('Added the resource "My notes" to Biology.');
    expect((await perform_tool_call({ tool: 'add_link_resource', arguments: { skill_id: skill.id, url: 'http://localhost/x' } }, context)).action.status).toBe('failed');
    expect((await call_tool(context, 'file_resource', { resource_id, topic_id: topic.id })).action.summary).toBe('Filed "Chapter 1" under the topic.');
    expect((await call_tool(context, 'file_resource', { resource_id, topic_id: null })).action.summary).toBe('Took "Chapter 1" out of its topic.');

    const deletions = [
      ['delete_resource', { resource_id }, 'Deleted the resource "Chapter 1".'],
      ['delete_topic', { topic_id: topic.id }, 'Deleted the topic "Cell biology".'],
      ['delete_skill', { skill_id: chemistry_id }, 'Deleted the skill "Chem".'],
    ];
    for (const [tool_name, args, summary] of deletions) {
      const outcome = await execute_tool(find_tool(tool_name), args, context);
      expect(outcome.action_fields.summary).toBe(summary);
    }
  });

  it('works with notes, quizzes, progress and the learning features', async () => {
    const { context, skill } = await create_tool_context();
    const note = JSON.parse((await call_tool(context, 'make_notes', { skill_id: skill.id, topic: 'Photosynthesis' })).result_for_ai).data;
    expect((await call_tool(context, 'list_notes', { skill_id: skill.id })).action.summary).toBe('1 set of notes');
    expect(JSON.parse((await call_tool(context, 'read_note', { note_id: note.id })).result_for_ai).data.content).toMatch('Photosynthesis');

    const quiz = await call_tool(context, 'make_quiz', { skill_id: skill.id, topic: 'Photosynthesis', question_count: 3 });
    expect(quiz.action.link).toMatch(/^\/dashboard\/quiz\?quiz=/);
    expect((await call_tool(context, 'list_quizzes', { skill_id: skill.id })).action.summary).toBe('1 quiz');
    expect((await call_tool(context, 'get_progress', {})).action.link).toBe('/dashboard/progress');

    expect((await call_tool(context, 'get_learning_path', { skill_id: skill.id })).action.summary).toBe('There is no path yet.');
    expect((await call_tool(context, 'build_learning_path', { skill_id: skill.id })).action.summary).toMatch(/learning path for Biology/);
    expect((await call_tool(context, 'get_learning_path', { skill_id: skill.id })).action.summary).toMatch(/steps? on the path/);

    const lesson = await call_tool(context, 'start_guided_lesson', { skill_id: skill.id, topic: 'Photosynthesis', step_count: 3 });
    expect(lesson.action.link).toMatch(/tab=lessons&lesson=/);
    expect((await call_tool(context, 'list_guided_lessons', { skill_id: skill.id })).action.summary).toBe('1 lesson');
    const practice = await call_tool(context, 'make_practice', { skill_id: skill.id, topic: 'Photosynthesis', problem_count: 1 });
    expect(practice.action.link).toMatch(/tab=practice&practice=/);
    expect((await call_tool(context, 'list_practice_sets', { skill_id: skill.id })).action.summary).toBe('1 practice set');

    expect((await call_tool(context, 'find_key_terms', { skill_id: skill.id })).action.summary).toMatch(/key terms? to Biology/);
    expect((await call_tool(context, 'add_key_term', { skill_id: skill.id, term: 'Osmosis', definition: 'Water moving.' })).action.summary).toBe('Added the key term "Osmosis".');
    expect((await call_tool(context, 'list_key_terms', { skill_id: skill.id })).action.summary).toMatch(/key terms/);
    expect((await call_tool(context, 'start_teaching_lesson', { skill_id: skill.id, topic: 'Cells' })).action.link).toMatch(/^\/dashboard\/teach\?session=/);
    expect(find_tool('make_quiz').label({ scope: 'skill' })).toBe('Make a quiz on the whole skill');
    expect(find_tool('make_quiz').label({})).toBe('Make a quiz on your choice');
    expect(find_tool('make_practice').label({ topic_id: 't1' })).toBe('Make practice problems on the chosen topic');
  });

  it('works with the schedule, settings and pages', async () => {
    const { context, skill } = await create_tool_context();
    const event = JSON.parse(
      (
        await call_tool(context, 'create_event', {
          title: 'Biology revision',
          starts_at: '2026-10-26T17:00:00+01:00',
          ends_at: '2026-10-26T18:00:00+01:00',
          skill_id: skill.id,
        })
      ).result_for_ai,
    ).data;
    expect(event.starts_at).toBe('2026-10-26T16:00:00.000Z');
    expect((await call_tool(context, 'list_events', { from: '2026-10-26T00:00:00Z', to: '2026-10-27T00:00:00Z' })).action.summary).toBe('1 event');
    expect((await perform_tool_call({ tool: 'list_events', arguments: { from: 'x' } }, context)).action.status).toBe('failed');
    expect((await call_tool(context, 'update_event', { event_id: event.id, title: 'Revision' })).action.summary).toBe('Updated "Revision".');
    expect((await execute_tool(find_tool('delete_event'), { event_id: event.id }, context)).action_fields.summary).toBe('Removed "Revision" from the schedule.');
    expect(find_tool('delete_event').label({ event_id: 'gone' }, context)).toBe('Remove gone from your schedule');

    expect((await call_tool(context, 'update_settings', { work_minutes: 40, email: 'x@example.com' })).action.summary).toBe('Updated work minutes.');
    expect(ASSISTANT_SETTING_FIELDS).not.toContain('email');
    expect((await perform_tool_call({ tool: 'update_settings', arguments: { work_minutes: 1 } }, context)).action.status).toBe('failed');

    expect((await call_tool(context, 'open_page', { path: '/dashboard/learn?skill=s1&tab=practice' })).client_action).toEqual({
      type: 'navigate',
      path: '/dashboard/learn?skill=s1&tab=practice',
    });
    expect((await perform_tool_call({ tool: 'open_page', arguments: { path: 'https://evil.example' } }, context)).action.status).toBe('failed');
  });

  it('makes, changes, lists and deletes widgets', async () => {
    const { context } = await create_tool_context();
    const card = await call_tool(context, 'create_widget', {
      title: 'Exam prep',
      kind: 'card',
      blocks: [{ type: 'checklist', items: ['Read', 'Revise'] }, { type: 'nonsense' }],
      pin_to: '*',
    });
    expect(card.action).toMatchObject({ summary: 'Made the widget "Exam prep".', widget_id: expect.any(String) });
    // Apps are built from a brief by the app builder (practice mode's builder here).
    const app = await call_tool(context, 'create_widget', { title: 'Calculator', kind: 'app', brief: 'A scientific calculator with brackets', width: 'medium' });
    expect(app.action.summary).toMatch(/^Made the app "Calculator": A scientific calculator/);
    expect(get_owned_widget(context.database, context.user_id, app.action.widget_id).spec).toEqual({ html: CALCULATOR_APP, height: 470 });
    expect((await perform_tool_call({ tool: 'create_widget', arguments: { title: 'Empty', kind: 'card', blocks: [] } }, context)).action.status).toBe('failed');
    expect((await perform_tool_call({ tool: 'create_widget', arguments: { title: 'No brief', kind: 'app' } }, context)).action.status).toBe('failed');

    const widgets = JSON.parse((await call_tool(context, 'list_widgets', {})).result_for_ai).data;
    expect(widgets.map((widget) => [widget.title, widget.block_types, widget.width])).toEqual([
      ['Calculator', null, 'medium'],
      ['Exam prep', ['checklist'], 'small'],
    ]);
    expect((await call_tool(context, 'update_widget', { widget_id: card.action.widget_id, title: 'Exam week', pin_to: null })).action.summary).toBe('Updated the widget "Exam week".');
    expect((await call_tool(context, 'update_widget', { widget_id: app.action.widget_id, brief: 'Turn it into a unit converter' })).action.summary).toBe('Updated the widget "Calculator".');
    expect(get_owned_widget(context.database, context.user_id, app.action.widget_id).spec.html).toBe(CONVERTER_APP);
    await call_tool(context, 'update_widget', { widget_id: card.action.widget_id, width: 'full', collapsed: true });
    await call_tool(context, 'update_widget', { widget_id: app.action.widget_id, collapsed: false });
    const laid_out = JSON.parse((await call_tool(context, 'list_widgets', {})).result_for_ai).data;
    expect(laid_out.map((widget) => [widget.width, widget.is_collapsed])).toEqual([
      ['medium', false],
      ['full', true],
    ]);
    await call_tool(context, 'update_widget', { widget_id: app.action.widget_id, mode: 'floating', stays: 'page', appearance: 'glass', accent: 'teal', content_size: 'compact' });
    expect(get_owned_widget(context.database, context.user_id, app.action.widget_id).layout).toMatchObject({
      mode: 'floating',
      anchor: 'page',
      appearance: 'glass',
      accent: 'teal',
      content_size: 'compact',
    });

    const stacked = await call_tool(context, 'stack_widgets', { widget_ids: [card.action.widget_id, app.action.widget_id], view: 'list', pin_to: '*', width: 'large' });
    expect(stacked.action.summary).toBe('Stacked 2 widgets.');
    const stack_id = JSON.parse(stacked.result_for_ai).data.stack_id;
    expect(get_owned_stack(context.database, context.user_id, stack_id)).toMatchObject({ view: 'list', pinned_paths: ['*'], layout: { width: 'large' } });
    expect(JSON.parse((await call_tool(context, 'list_widgets', {})).result_for_ai).data.every((widget) => widget.in_stack === stack_id)).toBe(true);
    expect((await call_tool(context, 'unstack_widgets', { stack_id })).action.summary).toBe('Took apart a stack of 2 widgets.');
    expect(find_tool('stack_widgets').label({}, context)).toBe('Stack 0 widgets');
    expect((await execute_tool(find_tool('delete_widget'), { widget_id: app.action.widget_id }, context)).action_fields.summary).toBe('Deleted the widget "Calculator".');
    expect(find_tool('delete_widget').label({ widget_id: 'gone' }, context)).toBe('Delete the widget gone');
  });

  it('sends an app that fails the checks back to the builder with what was wrong, then gives up', async () => {
    const good_app = { html: '<p class="hide-compact">Hi</p><script></script>', height: 200, summary: 'Says hi.' };
    const bad_app = { html: '<p class="hide-compact">Hi</p><script>eval(1)</script>', height: 200, summary: 'Says hi.' };
    const build_widget_app = vi.fn().mockResolvedValueOnce(bad_app).mockResolvedValueOnce(good_app);
    const built = await build_app_spec({ ai_provider: { build_widget_app } }, { title: 'Hi', brief: 'Say hi' });
    expect(built).toEqual({ spec: { html: good_app.html, height: 200 }, summary: 'Says hi.' });
    expect(build_widget_app).toHaveBeenLastCalledWith({ title: 'Hi', brief: 'Say hi', current_html: null, problem: APP_BLOCKED_CODE[0].problem, previous_html: bad_app.html });

    const always_bad = { build_widget_app: vi.fn().mockResolvedValue(bad_app) };
    await expect(build_app_spec({ ai_provider: always_bad }, { title: 'Hi', brief: 'Say hi' })).rejects.toThrow(/couldn't make a working app/);
    expect(always_bad.build_widget_app).toHaveBeenCalledTimes(APP_BUILD_ATTEMPTS);
    await expect(build_app_spec({ ai_provider: always_bad }, { title: 'Hi', brief: ' ' })).rejects.toThrow('Give a brief');
  });

  it('labels every tool without needing real ids', async () => {
    const { context } = await create_tool_context();
    for (const tool of ASSISTANT_TOOLS) {
      expect(typeof make_label(tool, { skill_id: 'x', topic_id: 'x', resource_id: 'x', title: 'T', name: 'N', topic: 'T', term: 'T', url: 'u', path: '/p' }, context)).toBe('string');
    }
  });
});
