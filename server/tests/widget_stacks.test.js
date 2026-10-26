import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { create_app } from '../app.js';
import { DEFAULT_WIDGET_LAYOUT, IN_MEMORY_DATABASE, MAX_STACK_WIDGETS, MAX_WIDGET_STACKS } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import { create_widget, delete_widget, get_owned_widget, order_layout_items } from '../services/widget_service.js';
import { validate_new_stack, validate_stack_updates, validate_stack_widget_ids } from '../services/widget_specs.js';
import {
  create_stack,
  delete_stack,
  find_widget_stack,
  get_owned_stack,
  list_stacks,
  update_stack,
} from '../services/widget_stack_service.js';
import { create_student_with_skill } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

const CARD = { title: 'Card', kind: 'card', spec: { blocks: [{ type: 'markdown', markdown: 'Hi' }] }, pinned_paths: ['/dashboard/quiz'] };

let database;
let user_id;
let widgets;

// A stack of the first two widgets (or the given ids) on the learn page.
function stack_widgets(widget_ids = [widgets[0].id, widgets[1].id]) {
  return create_stack(database, user_id, { widget_ids, view: 'swipe', pinned_paths: ['/dashboard/learn'], layout: DEFAULT_WIDGET_LAYOUT });
}

beforeEach(async () => {
  database = open_database(IN_MEMORY_DATABASE);
  ({ user_id } = await create_student_with_skill(database));
  widgets = ['Timer', 'Checklist', 'Notes'].map((title) => create_widget(database, user_id, { ...CARD, title }));
});

describe('stack checks', () => {
  it('needs two to ten different widgets, a known view and a usable pin and layout', () => {
    expect(validate_stack_widget_ids(['a', 'b'])).toBeNull();
    expect(validate_stack_widget_ids(['a'])).toMatch('2 to');
    expect(validate_stack_widget_ids(['a'], 1)).toBeNull();
    expect(validate_stack_widget_ids(Array.from({ length: MAX_STACK_WIDGETS + 1 }, (_, index) => `w${index}`))).toMatch('2 to');
    expect(validate_stack_widget_ids(['a', 'a'])).toMatch('once');
    expect(validate_stack_widget_ids(['a', 2])).toMatch('once');

    expect(validate_new_stack({ widget_ids: ['a', 'b'] }).values).toEqual({
      widget_ids: ['a', 'b'],
      view: 'swipe',
      pinned_paths: [],
      layout: DEFAULT_WIDGET_LAYOUT,
    });
    expect(validate_new_stack({ widget_ids: ['a'], view: 'grid', pinned_paths: ['x'], layout: [] }).field_errors).toEqual({
      widget_ids: expect.any(String),
      view: expect.stringMatching('View must be one of'),
      pinned_paths: expect.stringMatching('Pin to'),
      layout: 'Layout must be an object',
    });
  });

  it('checks stack updates, merging the layout', () => {
    expect(validate_stack_updates({}).field_errors).toEqual({ form: 'Nothing to update' });
    expect(validate_stack_updates({ view: 'list', active_widget_id: null, pinned_paths: ['*'], layout: { width: 'full' }, widget_ids: ['a'] }).values).toEqual({
      view: 'list',
      active_widget_id: null,
      pinned_paths: ['*'],
      layout: { ...DEFAULT_WIDGET_LAYOUT, width: 'full' },
      widget_ids: ['a'],
    });
    expect(validate_stack_updates({ view: 'grid', active_widget_id: 3, pinned_paths: ['x'], layout: 'big', widget_ids: [] }).field_errors).toEqual({
      view: expect.any(String),
      active_widget_id: expect.any(String),
      pinned_paths: expect.any(String),
      layout: expect.any(String),
      widget_ids: expect.any(String),
    });
  });
});

describe('stack service', () => {
  it('makes a stack, shows its first widget first, and finds the stack a widget is in', () => {
    const stack = stack_widgets();
    expect(stack).toMatchObject({ widget_ids: [widgets[0].id, widgets[1].id], active_widget_id: widgets[0].id, view: 'swipe', layout: DEFAULT_WIDGET_LAYOUT });
    expect(list_stacks(database, user_id)).toHaveLength(1);
    expect(find_widget_stack(database, user_id, widgets[1].id).id).toBe(stack.id);
    expect(find_widget_stack(database, user_id, widgets[2].id)).toBeNull();
    expect(() => get_owned_stack(database, 'someone-else', stack.id)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it("refuses widgets that aren't the student's or are already stacked, and too many stacks", () => {
    stack_widgets();
    expect(() => stack_widgets([widgets[1].id, widgets[2].id])).toThrow(expect.objectContaining({ status: 409, message: '"Checklist" is already in a stack' }));
    expect(() => stack_widgets([widgets[2].id, 'missing'])).toThrow(expect.objectContaining({ status: 404 }));

    for (let stack_number = 1; stack_number < MAX_WIDGET_STACKS; stack_number += 1) {
      const pair = [create_widget(database, user_id, CARD).id, create_widget(database, user_id, CARD).id];
      stack_widgets(pair);
    }
    expect(() => stack_widgets([widgets[2].id, create_widget(database, user_id, CARD).id])).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('reorders, adds and drops widgets, switches view and keeps the active widget one of its own', () => {
    const stack = stack_widgets();
    const updated = update_stack(database, user_id, stack.id, {
      widget_ids: [widgets[2].id, widgets[0].id],
      view: 'list',
      active_widget_id: widgets[1].id,
      layout: { ...stack.layout, mode: 'floating' },
    });
    expect(updated).toMatchObject({ widget_ids: [widgets[2].id, widgets[0].id], view: 'list', active_widget_id: widgets[2].id, layout: { mode: 'floating' } });
    // The dropped widget shows on its own where the stack is.
    expect(get_owned_widget(database, user_id, widgets[1].id).pinned_paths).toEqual(['/dashboard/learn']);
    expect(update_stack(database, user_id, stack.id, { active_widget_id: widgets[0].id }).active_widget_id).toBe(widgets[0].id);
  });

  it('takes a stack apart when one widget is left, or when asked, keeping the widgets where it was', () => {
    const stack = stack_widgets();
    expect(update_stack(database, user_id, stack.id, { widget_ids: [widgets[0].id], pinned_paths: ['*'] })).toBeNull();
    expect(list_stacks(database, user_id)).toEqual([]);
    expect(get_owned_widget(database, user_id, widgets[0].id).pinned_paths).toEqual(['*']);
    expect(get_owned_widget(database, user_id, widgets[1].id).pinned_paths).toEqual(['*']);

    const second_stack = stack_widgets();
    delete_stack(database, user_id, second_stack.id);
    expect(list_stacks(database, user_id)).toEqual([]);
    expect(get_owned_widget(database, user_id, widgets[0].id).pinned_paths).toEqual(['/dashboard/learn']);
  });

  it('rolls taking a stack apart back if saving fails part-way', () => {
    const stack = stack_widgets();
    database.exec("CREATE TRIGGER block_pin BEFORE UPDATE OF pinned_paths ON widgets WHEN NEW.title = 'Checklist' BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    expect(() => delete_stack(database, user_id, stack.id)).toThrow('blocked');
    expect(get_owned_stack(database, user_id, stack.id)).toBeTruthy();
    expect(get_owned_widget(database, user_id, widgets[0].id).pinned_paths).toEqual(['/dashboard/quiz']);
  });

  it('takes a deleted widget out of its stack', () => {
    const stack = create_stack(database, user_id, {
      widget_ids: widgets.map((widget) => widget.id),
      view: 'swipe',
      pinned_paths: [],
      layout: DEFAULT_WIDGET_LAYOUT,
    });
    delete_widget(database, user_id, widgets[0].id);
    expect(get_owned_stack(database, user_id, stack.id).widget_ids).toEqual([widgets[1].id, widgets[2].id]);
    delete_widget(database, user_id, widgets[1].id);
    expect(list_stacks(database, user_id)).toEqual([]);
    delete_widget(database, user_id, widgets[2].id);
  });

  it('orders stacks alongside widgets', () => {
    const stack = stack_widgets();
    order_layout_items(database, user_id, [
      { type: 'stack', id: stack.id },
      { type: 'widget', id: widgets[2].id },
    ]);
    expect(get_owned_stack(database, user_id, stack.id).layout.position).toBe(0);
    expect(get_owned_widget(database, user_id, widgets[2].id).layout.position).toBe(1);
  });
});

describe('stack routes', () => {
  it('makes, lists, changes and takes apart stacks', async () => {
    const app_database = open_database(IN_MEMORY_DATABASE);
    const app = create_app({ database: app_database, uploads_path: '.', client_origin: '', ai_provider: create_mock_ai_provider(), transcriber: null });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);
    const owner_id = app_database.prepare('SELECT id FROM users').get().id;
    const [first, second] = ['One', 'Two'].map((title) => create_widget(app_database, owner_id, { ...CARD, title }));

    const made = await as_student('post', '/api/widget-stacks').send({ widget_ids: [first.id, second.id], view: 'list', pinned_paths: ['*'] });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ view: 'list', pinned_paths: ['*'], active_widget_id: first.id });
    expect((await as_student('post', '/api/widget-stacks').send({ widget_ids: [first.id] })).status).toBe(400);
    expect((await as_student('get', '/api/widget-stacks')).body).toHaveLength(1);

    const changed = await as_student('patch', `/api/widget-stacks/${made.body.id}`).send({ active_widget_id: second.id, layout: { appearance: 'glass' } });
    expect(changed.body.stack).toMatchObject({ active_widget_id: second.id, layout: { appearance: 'glass' } });
    expect((await as_student('patch', `/api/widget-stacks/${made.body.id}`).send({ view: 'grid' })).status).toBe(400);
    expect((await as_student('patch', '/api/widget-stacks/missing').send({ view: 'swipe' })).status).toBe(404);
    expect((await as_student('patch', `/api/widget-stacks/${made.body.id}`).send({ widget_ids: [second.id] })).body).toEqual({ stack: null });

    const remade = await as_student('post', '/api/widget-stacks').send({ widget_ids: [first.id, second.id] });
    expect((await as_student('delete', `/api/widget-stacks/${remade.body.id}`)).status).toBe(204);
    expect((await as_student('delete', `/api/widget-stacks/${remade.body.id}`)).status).toBe(404);
  });
});
