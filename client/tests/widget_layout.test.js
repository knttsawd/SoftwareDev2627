import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGET_LOOK, FLOAT_CASCADE_PX, FLOAT_TOP_PX, WIDGET_CONTENT_HEIGHT, WIDGET_EDGE_MARGIN_PX, WIDGET_FLOAT_HEIGHT, WIDGET_FLOAT_WIDTH } from '../src/config/constants.js';
import {
  build_glass_filter,
  build_layout_items,
  build_look_style,
  clamp_content_height,
  describe_shape,
  clamp_float_rect,
  describe_size,
  drop_beside,
  find_active_member,
  find_appearance_details,
  find_drop_side,
  find_stack_item,
  find_width_details,
  get_corner_radius,
  get_item_title,
  list_item_widgets,
  move_by,
  place_new_float,
  resize_float_rect,
  snap_float_rect,
  sort_shelf_items,
  split_page_items,
  step_width,
  width_from_columns,
} from '../src/utils/widget_layout.js';

const LAYOUT = { width: 'small', height: null, is_collapsed: false, position: null, mode: 'docked', anchor: 'screen', x: null, y: null, float_width: null, float_height: null, content_size: 'auto', is_hidden: false, ...DEFAULT_WIDGET_LOOK };

// A widget with just what the layout helpers read.
function create_widget(id, layout_changes = {}, pinned_paths = ['*']) {
  return { id, title: `Widget ${id}`, pinned_paths, layout: { ...LAYOUT, ...layout_changes } };
}

const BOUNDS = { width: 1000, height: 800 };

describe('widths, looks and sizes', () => {
  it('finds a width or a look, falling back to the first, and steps between widths up to the ends', () => {
    expect(find_width_details('large').columns).toBe(4);
    expect(find_width_details('gigantic').id).toBe('small');
    expect(find_appearance_details('glass').label).toBe('Glass');
    expect(find_appearance_details('neon').id).toBe('solid');
    expect([step_width('small', -1), step_width('small', 1), step_width('large', 1), step_width('full', 1)]).toEqual(['small', 'medium', 'full', 'full']);
  });

  it('snaps a dragged number of columns to the closest width', () => {
    expect([-1, 1, 2, 3, 4, 5, 6, 9].map(width_from_columns)).toEqual(['small', 'small', 'small', 'medium', 'large', 'large', 'full', 'full']);
  });

  it('keeps heights whole and within the limits, and says sizes in words', () => {
    expect([clamp_content_height(5), clamp_content_height(200.6), clamp_content_height(99_999)]).toEqual([
      WIDGET_CONTENT_HEIGHT.min,
      201,
      WIDGET_CONTENT_HEIGHT.max,
    ]);
    expect(describe_size({ width: 'full', height: 320 })).toBe('Full width, 320 pixels tall');
    expect(describe_size({ width: 'medium', height: null })).toBe('Medium, fits its content');
    expect(describe_size(LAYOUT, { width: 480, height: 320 })).toBe('480 by 320 pixels');
    expect(describe_size(LAYOUT, { width: 340, height: null })).toBe('340 by fits its content');
  });
});

describe('shapes', () => {
  it('sizes content by its width, and gives it a shape only when its height is set', () => {
    const free = { is_height_fixed: false, content_size: 'auto' };
    expect([0, 200, 279, 280, 519, 520].map((width) => describe_shape({ width, height: 100 }, free).size)).toEqual([
      'regular',
      'compact',
      'compact',
      'regular',
      'regular',
      'large',
    ]);
    expect(describe_shape({ width: 600, height: 100 }, free).orientation).toBeNull();
    const fixed = { is_height_fixed: true, content_size: 'auto' };
    expect([
      describe_shape({ width: 600, height: 200 }, fixed).orientation,
      describe_shape({ width: 300, height: 300 }, fixed).orientation,
      describe_shape({ width: 200, height: 300 }, fixed).orientation,
      describe_shape({ width: 200, height: 0 }, fixed).orientation,
    ]).toEqual(['landscape', 'square', 'portrait', null]);
    expect(describe_shape({ width: 600, height: 100 }, { is_height_fixed: false, content_size: 'compact' }).size).toBe('compact');
  });
});

describe('items', () => {
  const widgets = [create_widget('a'), create_widget('b'), create_widget('c', {}, '/dashboard/quiz')];
  const stack = { id: 's1', widget_ids: ['b', 'gone', 'a'], active_widget_id: 'a', pinned_paths: ['/dashboard/learn'], layout: { ...LAYOUT, mode: 'floating' } };

  it('makes each stack and each unstacked widget an item, leaving out deleted widgets and empty stacks', () => {
    const items = build_layout_items(widgets, [stack, { id: 's2', widget_ids: ['gone'], layout: LAYOUT }]);
    expect(items.map((item) => item.key)).toEqual(['widget:c', 'stack:s1']);
    const stack_item = items[1];
    expect(stack_item.members.map((member) => member.id)).toEqual(['b', 'a']);
    expect([find_active_member(stack_item).id, get_item_title(stack_item), get_item_title(items[0])]).toEqual(['a', 'Widget a', 'Widget c']);
    expect(list_item_widgets(stack_item)).toHaveLength(2);
    expect(list_item_widgets(items[0])).toEqual([widgets[2]]);
    expect(find_active_member({ ...stack_item, record: { ...stack, active_widget_id: 'gone' } }).id).toBe('b');
    expect(find_stack_item([stack], widgets, 'a').id).toBe('s1');
    expect(find_stack_item([stack], widgets, 'c')).toBeNull();
  });

  it("splits a page's items into docked and floating, docking floating ones where they can't float", () => {
    const items = build_layout_items(widgets, [stack]);
    expect(split_page_items(items, '/dashboard/learn', true)).toMatchObject({ docked: [], floating: [{ key: 'stack:s1' }] });
    expect(split_page_items(items, '/dashboard/learn', false)).toMatchObject({ docked: [{ key: 'stack:s1' }], floating: [] });
    expect(split_page_items(items, '/dashboard/quiz', true).docked.map((item) => item.key)).toEqual(['widget:c']);
  });

  it('puts never-moved items first, then the rest by position', () => {
    const items = [create_widget('b', { position: 1 }), create_widget('new'), create_widget('a', { position: 0 }), create_widget('newer')];
    expect(sort_shelf_items(items).map((item) => item.id)).toEqual(['new', 'newer', 'a', 'b']);
  });
});

describe('moving docked items', () => {
  it('moves an item by places, stopping at the ends', () => {
    const keys = ['a', 'b', 'c'];
    expect(move_by(keys, 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(move_by(keys, 'c', -Infinity)).toEqual(['c', 'a', 'b']);
    expect(move_by(keys, 'a', Infinity)).toEqual(['b', 'c', 'a']);
    expect(move_by(keys, 'a', -1)).toEqual(keys);
  });

  it('drops an item on the right side of another', () => {
    const keys = ['a', 'b', 'c'];
    expect(drop_beside(keys, 'a', 'c', 'left')).toEqual(['b', 'a', 'c']);
    expect(drop_beside(keys, 'a', 'c', 'below')).toEqual(['b', 'c', 'a']);
    expect(drop_beside(keys, 'c', 'a', 'above')).toEqual(['c', 'a', 'b']);
    expect(drop_beside(keys, 'c', 'a', 'right')).toEqual(['a', 'c', 'b']);
  });

  it('works out the part of an item under the pointer: its middle stacks, its sides go beside', () => {
    const half_rect = { left: 0, top: 0, width: 300, height: 200 };
    expect(find_drop_side(half_rect, 600, 150, 100)).toBe('center');
    expect(find_drop_side(half_rect, 600, 50, 190)).toBe('left');
    expect(find_drop_side(half_rect, 600, 250, 10)).toBe('right');
    const full_rect = { left: 0, top: 0, width: 600, height: 200 };
    expect(find_drop_side(full_rect, 600, 590, 50)).toBe('above');
    expect(find_drop_side(full_rect, 600, 10, 150)).toBe('below');
  });
});

describe('floating windows', () => {
  it('keeps a window inside its bounds, and settles it against an edge it was dropped near', () => {
    expect(clamp_float_rect({ x: -50, y: 900, width: 300, height: 200 }, BOUNDS)).toEqual({ x: 0, y: 600, width: 300, height: 200 });
    expect(clamp_float_rect({ x: 10.4, y: 10.6, width: 2000, height: 100 }, BOUNDS)).toMatchObject({ x: 0, y: 11 });
    expect(snap_float_rect({ x: 5, y: 790 - 200, width: 300, height: 200 }, BOUNDS)).toEqual({ x: WIDGET_EDGE_MARGIN_PX, y: 800 - 200 - WIDGET_EDGE_MARGIN_PX, width: 300, height: 200 });
    expect(snap_float_rect({ x: 690, y: 10, width: 300, height: 200 }, BOUNDS)).toMatchObject({ x: 1000 - 300 - WIDGET_EDGE_MARGIN_PX, y: WIDGET_EDGE_MARGIN_PX });
    expect(snap_float_rect({ x: 400, y: 300, width: 300, height: 200 }, BOUNDS)).toMatchObject({ x: 400, y: 300 });
  });

  it('keeps a window within bounds that start beside the sidebar', () => {
    const beside_sidebar = { left: 288, top: 0, width: 712, height: 800 };
    expect(clamp_float_rect({ x: 100, y: 10, width: 300, height: 200 }, beside_sidebar).x).toBe(288);
    expect(snap_float_rect({ x: 300, y: 300, width: 300, height: 200 }, beside_sidebar).x).toBe(288 + WIDGET_EDGE_MARGIN_PX);
    expect(place_new_float(beside_sidebar, 300, 0, 'screen').x).toBe(1000 - 300 - WIDGET_EDGE_MARGIN_PX);
    expect(place_new_float(beside_sidebar, 900, 0, 'screen').x).toBe(288);
  });

  it('resizes from any edge or corner, keeping the opposite edges still and the size within limits', () => {
    const start = { x: 100, y: 100, width: 400, height: 300 };
    expect(resize_float_rect(start, 'se', 50, 20)).toEqual({ x: 100, y: 100, width: 450, height: 320 });
    expect(resize_float_rect(start, 'nw', 50, 20)).toEqual({ x: 150, y: 120, width: 350, height: 280 });
    expect(resize_float_rect(start, 'e', 50, 999)).toEqual({ ...start, width: 450 });
    expect(resize_float_rect(start, 'n', 999, -40)).toEqual({ ...start, y: 60, height: 340 });
    expect(resize_float_rect(start, 'w', 1000, 0)).toEqual({ ...start, x: 100 + 400 - WIDGET_FLOAT_WIDTH.min, width: WIDGET_FLOAT_WIDTH.min });
    expect(resize_float_rect(start, 's', 0, 99_999).height).toBe(WIDGET_FLOAT_HEIGHT.max);
  });

  it('opens new windows near the top right, each a little lower than the last', () => {
    expect(place_new_float(BOUNDS, 300, 0, 'screen')).toEqual({ x: 1000 - 300 - WIDGET_EDGE_MARGIN_PX, y: FLOAT_TOP_PX });
    expect(place_new_float(BOUNDS, 300, 2, 'page')).toEqual({ x: 1000 - 300 - WIDGET_EDGE_MARGIN_PX, y: WIDGET_EDGE_MARGIN_PX + 2 * FLOAT_CASCADE_PX });
    expect(place_new_float({ width: 200, height: 400 }, 300, 0, 'page').x).toBe(0);
  });
});

describe('looks and hiding', () => {
  const LOOK = { ...LAYOUT, glass_opacity: 40, glass_frost: 12, glass_vibrance: 130, tint_strength: 20 };

  it('turns a look into the CSS variables theme.css uses', () => {
    expect(build_look_style(LOOK)).toEqual({
      '--widget-radius': '22px',
      '--widget-tint': '20%',
      '--glass-fill': 'color-mix(in oklab, var(--color-surface) 40%, transparent)',
      '--glass-filter': 'blur(12px) saturate(130%)',
    });
    expect(build_look_style({ ...LOOK, glass_tint: 'accent' })['--glass-fill']).toBe('color-mix(in oklab, var(--widget-accent) 40%, transparent)');
    expect(build_glass_filter({ ...LOOK, glass_frost: 0, glass_vibrance: 100 })).toBe('blur(0px) saturate(100%)');
    expect(get_corner_radius({ corners: 'subtle' })).toBe(14);
    expect(get_corner_radius({ corners: 'extra' })).toBe(30);
    expect(get_corner_radius({})).toBe(22);
  });

  it('leaves hidden items off every page', () => {
    const shown = create_widget('a');
    const hidden = create_widget('b', { is_hidden: true });
    expect(split_page_items(build_layout_items([shown, hidden], []), '/dashboard/quiz', true).docked.map((item) => item.id)).toEqual(['a']);
  });
});
