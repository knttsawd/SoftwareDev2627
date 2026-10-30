import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { create_app } from '../app.js';
import {
  DEFAULT_WIDGET_LAYOUT,
  IN_MEMORY_DATABASE,
  MAX_WIDGETS,
  WIDGET_CONTENT_HEIGHT,
  WIDGET_HEIGHT,
  WIDGET_HTML_MAX_LENGTH,
  WIDGET_STATE_MAX_LENGTH,
} from '../config/constants.js';
import { open_database } from '../db/database.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import { create_event } from '../services/event_service.js';
import { build_learning_path } from '../services/learning_path_service.js';
import { create_practice_quiz, get_owned_quiz, submit_quiz_answers } from '../services/quiz_service.js';
import { add_topic } from '../services/topic_service.js';
import {
  create_widget,
  delete_widget,
  get_live_widget_data,
  get_owned_widget,
  list_widgets,
  order_layout_items,
  update_widget,
} from '../services/widget_service.js';
import {
  APP_SIZE_ERROR,
  clean_widget_block,
  clean_pinned_paths,
  clean_widget_spec,
  find_incomplete_html,
  clip_text,
  is_dashboard_link,
  validate_new_widget,
  validate_widget_layout,
  validate_widget_order,
  validate_widget_state,
  validate_widget_updates,
} from '../services/widget_specs.js';
import { create_student_with_skill, insert_test_resource } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

const NOW = new Date('2026-10-25T13:00:00.000Z');
const CARD = { title: 'Exam prep', kind: 'card', spec: { blocks: [{ type: 'markdown', markdown: 'Hi' }] }, pinned_paths: [] };

describe('widget specs', () => {
  it('clips text and only allows dashboard links', () => {
    expect(clip_text('  abc  ', 2)).toBe('ab');
    expect(clip_text(5, 2)).toBe('');
    expect(is_dashboard_link('/dashboard/learn?skill=s1&tab=path')).toBe(true);
    expect(is_dashboard_link('/dashboard/learn')).toBe(true);
    expect(is_dashboard_link('https://evil.example')).toBe(false);
    expect(is_dashboard_link('/dashboard/learn?x="><script>')).toBe(false);
    expect(is_dashboard_link('/dashboard')).toBe(false);
    expect(is_dashboard_link(null)).toBe(false);
  });

  it('cleans each kind of block and drops unusable ones', () => {
    expect(clean_widget_block({ type: 'markdown', markdown: ' # Hi ', title: ' Notes ' })).toEqual({ type: 'markdown', title: 'Notes', markdown: '# Hi' });
    expect(clean_widget_block({ type: 'markdown', markdown: ' ' })).toBeNull();
    expect(clean_widget_block({ type: 'checklist', items: ['a', '', 3, 'b'] })).toEqual({ type: 'checklist', items: ['a', 'b'] });
    expect(clean_widget_block({ type: 'countdown', label: 'Exam', target: '2026-11-01T09:00:00Z' })).toEqual({
      type: 'countdown',
      label: 'Exam',
      target: '2026-11-01T09:00:00.000Z',
    });
    expect(clean_widget_block({ type: 'countdown', label: 'Exam', target: 'soon' })).toBeNull();
    expect(clean_widget_block({ type: 'flashcards', cards: [{ front: 'Q', back: 'A' }, { front: 'Q' }] })).toEqual({
      type: 'flashcards',
      cards: [{ front: 'Q', back: 'A' }],
    });
    expect(clean_widget_block({ type: 'links', links: [{ label: 'Learn', path: '/dashboard/learn' }, { label: 'Bad', path: 'javascript:alert(1)' }] })).toEqual({
      type: 'links',
      links: [{ label: 'Learn', path: '/dashboard/learn' }],
    });
    expect(clean_widget_block({ type: 'live', source: 'weak_topics', skill_id: 's1' })).toEqual({ type: 'live', source: 'weak_topics', skill_id: 's1' });
    expect(clean_widget_block({ type: 'live', source: 'passwords' })).toBeNull();
    expect(clean_widget_block({ type: 'script' })).toBeNull();
    expect(clean_widget_block(null)).toBeNull();
  });

  it('needs a usable block for a card, and html of a sensible size for an app', () => {
    expect(clean_widget_spec('card', { blocks: [{ type: 'nope' }] }).error).toMatch('at least one usable block');
    const responsive_html = '<p class="only-compact">Hi</p><script>start()</script>';
    expect(clean_widget_spec('app', { html: ` ${responsive_html} ` })).toEqual({ spec: { html: responsive_html, height: WIDGET_HEIGHT.default } });
    expect(clean_widget_spec('app', { html: responsive_html, height: 5 }).spec.height).toBe(WIDGET_HEIGHT.min);
    expect(clean_widget_spec('app', { html: '<style>[data-size="compact"] p{display:none}</style><p>Hi</p><script></script>' }).spec).toBeTruthy();
    expect(clean_widget_spec('app', { html: '<p>Hi</p><script></script>' }).error).toBe(APP_SIZE_ERROR);
    // Unfinished html (an AI answer cut short) is turned down, saying what's wrong.
    expect(clean_widget_spec('app', { html: '<p class="hide-compact">Hi</p>' }).error).toBe('An app needs its <script>');
    expect(find_incomplete_html('<script>go()')).toMatch('unclosed <script>');
    expect(find_incomplete_html('<style>p{}<script></script>')).toMatch('unclosed <style>');
    expect(find_incomplete_html('<!-- note <script></script>')).toMatch('unclosed comment');
    expect(find_incomplete_html('<script></script><button type=')).toMatch('stops in the middle of a tag');
    expect(find_incomplete_html('<p>1 < 2</p><script>if (a < b) go();</script>')).toBeNull();
    expect(clean_widget_spec('app', { html: '' }).error).toBe('An app needs its html');
    expect(clean_widget_spec('app', { html: 'x'.repeat(WIDGET_HTML_MAX_LENGTH + 1) }).error).toMatch('Keep the app under');
  });

  it('checks where a widget is pinned and its saved state', () => {
    expect(clean_pinned_paths([])).toEqual({ error: null, pinned_paths: [] });
    expect(clean_pinned_paths(['/dashboard/quiz', '*'])).toEqual({ error: null, pinned_paths: ['*'] });
    expect(clean_pinned_paths(['/dashboard/learn', '/dashboard/quiz', '/dashboard/learn']).pinned_paths).toEqual(['/dashboard/learn', '/dashboard/quiz']);
    expect(clean_pinned_paths(['/dashboard/learn?x=1']).error).toMatch('Pin to a list of dashboard pages');
    expect(clean_pinned_paths('/dashboard/learn').error).toMatch('Pin to');
    expect(clean_pinned_paths(Array.from({ length: 13 }, (unused, index) => `/dashboard/page${index}`)).error).toMatch('Pin to');
    expect(validate_widget_state({ checked: { 0: [true] } })).toBeNull();
    expect(validate_widget_state([])).toBe('State must be an object');
    expect(validate_widget_state({ text: 'x'.repeat(WIDGET_STATE_MAX_LENGTH) })).toBe('That state is too big to save');
  });

  it('validates new widgets and updates', () => {
    expect(validate_new_widget(CARD).values).toEqual({ ...CARD, spec: { blocks: [{ type: 'markdown', markdown: 'Hi' }] }, layout: DEFAULT_WIDGET_LAYOUT });
    expect(validate_new_widget({ ...CARD, layout: { width: 'large', appearance: 'glass' } }).values.layout).toMatchObject({ width: 'large', appearance: 'glass' });
    expect(validate_new_widget({ ...CARD, layout: { width: 'large' } }).values.layout.width).toBe('large');
    expect(validate_new_widget({ ...CARD, layout: { width: 'huge' } }).field_errors.layout).toMatch('Width must be one of');
    expect(validate_new_widget({ kind: 'movie', pinned_paths: ['x'] }).field_errors).toEqual({
      title: 'Give the widget a title',
      kind: 'Choose one of: card, app',
      pinned_paths: expect.stringMatching('Pin to'),
    });
    expect(validate_new_widget({ ...CARD, spec: {} }).field_errors.spec).toMatch('usable block');

    expect(validate_widget_updates({}, 'card').field_errors).toEqual({ form: 'Nothing to update' });
    expect(validate_widget_updates({ title: ' New ', state: { a: 1 }, pinned_paths: ['*'] }, 'card').values).toEqual({ title: 'New', state: { a: 1 }, pinned_paths: ['*'] });
    expect(validate_widget_updates({ title: ' ', spec: {}, state: 'x', pinned_paths: ['nope'] }, 'card').field_errors).toEqual({
      title: 'Give the widget a title',
      spec: expect.any(String),
      state: 'State must be an object',
      pinned_paths: expect.any(String),
    });
    const app_html = '<p class="hide-compact">x</p><script></script>';
    expect(validate_widget_updates({ spec: { html: app_html } }, 'app').values.spec.html).toBe(app_html);
    expect(validate_widget_updates({ layout: { is_collapsed: true } }, 'card', { ...DEFAULT_WIDGET_LAYOUT, width: 'full' }).values.layout).toEqual({
      ...DEFAULT_WIDGET_LAYOUT,
      width: 'full',
      is_collapsed: true,
    });
    expect(validate_widget_updates({ layout: 'wide' }, 'card').field_errors.layout).toBe('Layout must be an object');
  });

  it('checks layouts, keeping heights within limits, and new orders', () => {
    const resized = validate_widget_layout({ width: 'medium', height: 10_000, position: 2 });
    expect(resized).toEqual({ error: null, layout: { ...DEFAULT_WIDGET_LAYOUT, width: 'medium', height: WIDGET_CONTENT_HEIGHT.max, position: 2 } });
    expect(validate_widget_layout({ height: 10.4 }).layout.height).toBe(WIDGET_CONTENT_HEIGHT.min);
    expect(validate_widget_layout({ height: null }, { ...DEFAULT_WIDGET_LAYOUT, height: 300 }).layout.height).toBeNull();
    expect(validate_widget_layout([]).error).toBe('Layout must be an object');
    expect(validate_widget_layout({ width: 'huge' }).error).toMatch('Width must be one of');
    expect(validate_widget_layout({ height: 'tall' }).error).toMatch('Height must be a number');
    expect(validate_widget_layout({ is_collapsed: 'yes' }).error).toMatch('is_collapsed');
    expect(validate_widget_layout({ position: -1 }).error).toMatch('Position');
    const floating = validate_widget_layout({ mode: 'floating', anchor: 'page', x: 40.6, y: -99_999, float_width: 50, float_height: 400, appearance: 'glass', accent: 'teal' });
    expect(floating.layout).toMatchObject({ mode: 'floating', anchor: 'page', x: 41, y: -20_000, float_width: 220, float_height: 400, appearance: 'glass', accent: 'teal' });
    expect(validate_widget_layout({ mode: 'hovering' }).error).toMatch('Mode must be one of');
    expect(validate_widget_layout({ accent: 'gold' }).error).toMatch('Accent must be one of');
    expect(validate_widget_layout({ x: 'left' }).error).toBe('X must be a number of pixels, or null');
    expect(validate_widget_layout({ content_size: 'large' }).layout.content_size).toBe('large');
    expect(validate_widget_layout({ content_size: 'huge' }).error).toMatch('Content size must be one of');

    expect(validate_widget_order({ items: [{ type: 'widget', id: 'a' }, { type: 'stack', id: 'a' }] })).toBeNull();
    expect(validate_widget_order({ items: [] })).toMatch('new order');
    expect(validate_widget_order({})).toMatch('new order');
    expect(validate_widget_order({ items: [{ type: 'widget', id: 'a' }, { type: 'widget', id: 'a' }] })).toMatch('different');
    expect(validate_widget_order({ items: [{ type: 'panel', id: 'a' }] })).toMatch('different');
    expect(validate_widget_order({ items: [{ type: 'widget', id: 3 }] })).toMatch('different');
  });
});

describe('widget service', () => {
  it('creates, lists, updates and deletes the student’s widgets', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id } = await create_student_with_skill(database);
    const widget = create_widget(database, user_id, CARD);
    expect(widget).toMatchObject({ title: 'Exam prep', state: {}, pinned_paths: [], spec: CARD.spec });
    expect(update_widget(database, user_id, widget.id, { title: 'Week', state: { checked: {} }, pinned_paths: ['*'] })).toMatchObject({
      title: 'Week',
      state: { checked: {} },
      pinned_paths: ['*'],
    });
    expect(update_widget(database, user_id, widget.id, { spec: { blocks: [] } }).spec).toEqual({ blocks: [] });
    expect(list_widgets(database, user_id)).toHaveLength(1);
    expect(() => get_owned_widget(database, 'someone-else', widget.id)).toThrow(expect.objectContaining({ status: 404 }));
    delete_widget(database, user_id, widget.id);
    expect(list_widgets(database, user_id)).toEqual([]);
  });

  it('saves layouts, and reorders all or nothing', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id } = await create_student_with_skill(database);
    const first = create_widget(database, user_id, CARD);
    const second = create_widget(database, user_id, { ...CARD, layout: { ...DEFAULT_WIDGET_LAYOUT, width: 'full' } });
    expect(first.layout).toEqual(DEFAULT_WIDGET_LAYOUT);
    expect(update_widget(database, user_id, first.id, { layout: { ...first.layout, height: 240 } }).layout.height).toBe(240);

    order_layout_items(database, user_id, [
      { type: 'widget', id: second.id },
      { type: 'widget', id: first.id },
    ]);
    expect(get_owned_widget(database, user_id, second.id).layout).toMatchObject({ width: 'full', position: 0 });
    expect(get_owned_widget(database, user_id, first.id).layout).toMatchObject({ height: 240, position: 1 });
    expect(() => order_layout_items(database, user_id, [{ type: 'widget', id: first.id }, { type: 'stack', id: 'missing' }])).toThrow(
      expect.objectContaining({ status: 404 }),
    );
    expect(get_owned_widget(database, user_id, first.id).layout.position).toBe(1);
  });

  it('rolls a reorder back when saving fails part-way', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id } = await create_student_with_skill(database);
    const widget = create_widget(database, user_id, CARD);
    database.exec("CREATE TRIGGER block_second BEFORE UPDATE ON widgets WHEN json_extract(NEW.layout, '$.position') = 1 BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    const other = create_widget(database, user_id, CARD);
    expect(() =>
      order_layout_items(database, user_id, [
        { type: 'widget', id: widget.id },
        { type: 'widget', id: other.id },
      ]),
    ).toThrow('blocked');
    expect(get_owned_widget(database, user_id, widget.id).layout.position).toBeNull();
  });

  it('limits how many widgets a student has', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id } = await create_student_with_skill(database);
    for (let widget_number = 0; widget_number < MAX_WIDGETS; widget_number += 1) create_widget(database, user_id, CARD);
    expect(() => create_widget(database, user_id, CARD)).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('works out each live source as a list of items', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const { user_id, skill } = await create_student_with_skill(database);
    insert_test_resource(database, { user_id, skill_id: skill.id });
    const ai_provider = create_mock_ai_provider();
    add_topic(database, user_id, skill.id, { topic: 'Photosynthesis' });
    await build_learning_path({ database, ai_provider, user_id, skill });
    create_event(database, user_id, { title: 'Exam', starts_at: '2026-10-27T09:00:00.000Z', ends_at: '2026-10-27T10:00:00.000Z', skill_id: skill.id });
    const quiz = await create_practice_quiz({ database, ai_provider, user_id, skill, quiz_details: { scope: 'topic', topic: 'Photosynthesis', topic_id: null, resource_id: null, question_count: 3 } });
    submit_quiz_answers(database, user_id, get_owned_quiz(database, user_id, quiz.id), quiz.questions.map(() => 0));

    const live = (source, skill_id = null) => get_live_widget_data(database, user_id, { source, skill_id, now: NOW }).items;
    expect(live('weak_topics', skill.id)[0]).toMatchObject({ label: 'Photosynthesis', link: expect.stringContaining('tab=lessons') });
    expect(live('upcoming_events')).toEqual([{ label: 'Exam', detail: 'Biology', starts_at: '2026-10-27T09:00:00.000Z', link: '/dashboard/schedule' }]);
    expect(live('progress_summary').map((item) => item.label)).toEqual(['Average quiz score', 'Focus time', 'Strong topics']);
    expect(live('learning_path_next')[0]).toMatchObject({ label: 'Photosynthesis', detail: 'Biology · next up' });
    expect(live('recent_results')[0]).toMatchObject({ label: 'Photosynthesis', link: `/dashboard/quiz?quiz=${quiz.id}` });
    expect(() => get_live_widget_data(database, user_id, { source: 'secrets' })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => get_live_widget_data(database, user_id, { source: 'weak_topics', skill_id: 'nope' })).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('widget routes', () => {
  it('lists, renames, pins, ticks, reads live data and deletes', async () => {
    const database = open_database(IN_MEMORY_DATABASE);
    const app = create_app({ database, uploads_path: '.', client_origin: '', ai_provider: create_mock_ai_provider(), transcriber: null });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);
    const widget = create_widget(database, database.prepare('SELECT id FROM users').get().id, CARD);

    expect((await as_student('get', '/api/widgets')).body).toHaveLength(1);
    const patched = await as_student('patch', `/api/widgets/${widget.id}`).send({ title: 'Renamed', pinned_paths: ['/dashboard/learn'], state: { checked: { 0: [true] } }, spec: { blocks: [] } });
    expect(patched.body).toMatchObject({ title: 'Renamed', pinned_paths: ['/dashboard/learn'], spec: CARD.spec });
    expect((await as_student('patch', `/api/widgets/${widget.id}`).send({ pinned_paths: ['https://x'] })).status).toBe(400);
    const resized = await as_student('patch', `/api/widgets/${widget.id}`).send({ layout: { width: 'large', is_collapsed: true } });
    expect(resized.body.layout).toEqual({ ...DEFAULT_WIDGET_LAYOUT, width: 'large', is_collapsed: true });
    expect((await as_student('put', '/api/widgets/order').send({ items: [{ type: 'widget', id: widget.id }] })).status).toBe(204);
    expect((await as_student('get', '/api/widgets')).body[0].layout).toMatchObject({ width: 'large', position: 0 });
    expect((await as_student('put', '/api/widgets/order').send({ items: 'all' })).status).toBe(400);
    expect((await as_student('put', '/api/widgets/order').send({ items: [{ type: 'widget', id: 'someone-elses' }] })).status).toBe(404);
    expect((await as_student('get', '/api/widgets/live/progress_summary')).body.items).toHaveLength(3);
    expect((await as_student('get', '/api/widgets/live/nope')).status).toBe(400);
    expect((await as_student('delete', `/api/widgets/${widget.id}`)).status).toBe(204);
    expect((await as_student('delete', `/api/widgets/${widget.id}`)).status).toBe(404);
  });
});
