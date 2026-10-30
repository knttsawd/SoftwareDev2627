import {
  FLOAT_CASCADE_PX,
  FLOAT_TOP_PX,
  SHELF_COLUMNS,
  WIDGET_CONTENT_HEIGHT,
  WIDGET_CORNER_RADII,
  WIDGET_EDGE_MARGIN_PX,
  WIDGET_FLOAT_HEIGHT,
  WIDGET_FLOAT_WIDTH,
  WIDGET_FULL_ROW_SHARE,
  WIDGET_LANDSCAPE_RATIO,
  WIDGET_PORTRAIT_RATIO,
  WIDGET_SIZE_CLASS_WIDTHS,
  WIDGET_SNAP_DISTANCE_PX,
} from '../config/constants.js';
import { is_pinned_here } from './widgets.js';

// How widgets are laid out on a page. The page arranges "items": a widget on its own, or a
// smart stack of widgets. Each item has a layout (saved on the server): docked in the grid
// above the page, or floating as a window; folded away or not; and its look.

// The widths a docked item can take, narrowest first: its name in the menu, how many of the
// shelf's SHELF_COLUMNS it spans on a wide screen, and its grid classes. Phones show one
// item per row; tablets two halves (small and medium) or the full row (large and full).
export const WIDGET_WIDTH_DETAILS = [
  { id: 'small', label: 'Small', columns: 2, classes: 'md:col-span-3 xl:col-span-2' },
  { id: 'medium', label: 'Medium', columns: 3, classes: 'md:col-span-3' },
  { id: 'large', label: 'Large', columns: 4, classes: 'md:col-span-6 xl:col-span-4' },
  { id: 'full', label: 'Full width', columns: SHELF_COLUMNS, classes: 'md:col-span-6' },
];

// Each look: its name in the Customize panel, and its classes. "glass" lets the page show
// through (.widget-glass in theme.css); "tinted" mixes in some of the accent (.widget-tinted).
export const WIDGET_APPEARANCE_DETAILS = [
  { id: 'solid', label: 'Solid', classes: 'border-border bg-surface' },
  { id: 'glass', label: 'Glass', classes: 'widget-glass' },
  { id: 'tinted', label: 'Tinted', classes: 'widget-tinted' },
];

// The other look choices, named for the Customize panel.
export const WIDGET_CORNER_DETAILS = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'round', label: 'Round' },
  { id: 'extra', label: 'Extra round' },
];
export const WIDGET_SHADOW_DETAILS = [
  { id: 'none', label: 'None' },
  { id: 'soft', label: 'Soft' },
  { id: 'deep', label: 'Deep' },
];
export const WIDGET_GLASS_TINT_DETAILS = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'accent', label: 'Accent' },
];

// The CSS variables a window's look sets, which theme.css uses: its corner radius, a tinted
// widget's tint strength, and a glass widget's fill (its tint at its opacity) and filter.
export function build_look_style(layout) {
  const tint_color = layout.glass_tint === 'accent' ? 'var(--widget-accent)' : 'var(--color-surface)';
  return {
    '--widget-radius': `${get_corner_radius(layout)}px`,
    '--widget-tint': `${layout.tint_strength}%`,
    '--glass-fill': `color-mix(in oklab, ${tint_color} ${layout.glass_opacity}%, transparent)`,
    '--glass-filter': build_glass_filter(layout),
  };
}

// A glass widget's frost and colour boost as a CSS filter: "blur(8px) saturate(100%)".
export function build_glass_filter(layout) {
  return `blur(${layout.glass_frost}px) saturate(${layout.glass_vibrance}%)`;
}

// A window's corner radius in pixels.
export function get_corner_radius(layout) {
  return WIDGET_CORNER_RADII[layout.corners] ?? WIDGET_CORNER_RADII.round;
}

// The accent colors, named for screen readers (the colors themselves are in theme.css).
export const WIDGET_ACCENT_DETAILS = [
  { id: 'indigo', label: 'Indigo' },
  { id: 'teal', label: 'Teal' },
  { id: 'sky', label: 'Sky' },
  { id: 'green', label: 'Green' },
  { id: 'amber', label: 'Amber' },
  { id: 'rose', label: 'Rose' },
  { id: 'slate', label: 'Slate' },
];

// The content sizes a widget can use, named for the menu: "auto" follows its size.
export const WIDGET_CONTENT_SIZE_DETAILS = [
  { id: 'auto', label: 'Auto' },
  { id: 'compact', label: 'Small' },
  { id: 'regular', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

// How a widget's content should lay itself out, from the size of its content area (box:
// { width, height } in pixels): { size, orientation }. size is "compact", "regular" or
// "large", from the width (or content_size when it isn't "auto"); before the box is
// measured it's "regular". orientation is "landscape", "square" or "portrait" when the
// height is fixed (is_height_fixed), or null when the content sets its own height.
export function describe_shape(box, { is_height_fixed, content_size }) {
  let measured_size = 'regular';
  if (box.width >= WIDGET_SIZE_CLASS_WIDTHS.large) measured_size = 'large';
  else if (box.width > 0 && box.width < WIDGET_SIZE_CLASS_WIDTHS.regular) measured_size = 'compact';
  const size = content_size && content_size !== 'auto' ? content_size : measured_size;
  if (!is_height_fixed || box.height <= 0) return { size, orientation: null };
  const ratio = box.width / box.height;
  const orientation = ratio > WIDGET_LANDSCAPE_RATIO ? 'landscape' : ratio < WIDGET_PORTRAIT_RATIO ? 'portrait' : 'square';
  return { size, orientation };
}

export function find_width_details(width) {
  return WIDGET_WIDTH_DETAILS.find((width_details) => width_details.id === width) ?? WIDGET_WIDTH_DETAILS[0];
}

export function find_appearance_details(appearance) {
  return WIDGET_APPEARANCE_DETAILS.find((appearance_details) => appearance_details.id === appearance) ?? WIDGET_APPEARANCE_DETAILS[0];
}

// The next width wider (step 1) or narrower (step -1), stopping at the ends.
export function step_width(width, step) {
  const width_index = WIDGET_WIDTH_DETAILS.indexOf(find_width_details(width));
  const next_index = Math.min(WIDGET_WIDTH_DETAILS.length - 1, Math.max(0, width_index + step));
  return WIDGET_WIDTH_DETAILS[next_index].id;
}

// The width whose column count is closest to columns (a docked edge dragged that far).
export function width_from_columns(columns) {
  return WIDGET_WIDTH_DETAILS.reduce((closest, width_details) =>
    Math.abs(width_details.columns - columns) < Math.abs(closest.columns - columns) ? width_details : closest,
  ).id;
}

// A content height in whole pixels, within WIDGET_CONTENT_HEIGHT.
export function clamp_content_height(height) {
  return Math.round(Math.min(WIDGET_CONTENT_HEIGHT.max, Math.max(WIDGET_CONTENT_HEIGHT.min, height)));
}

// An item's size in words, for screen readers and the badge shown while resizing:
// "Large, 320 pixels tall" when docked, "480 by 320 pixels" when floating.
export function describe_size(layout, floating_size = null) {
  if (floating_size) {
    const height_text = floating_size.height === null ? 'fits its content' : `${floating_size.height} pixels`;
    return `${floating_size.width} by ${height_text}`;
  }
  const height_text = layout.height === null ? 'fits its content' : `${layout.height} pixels tall`;
  return `${find_width_details(layout.width).label}, ${height_text}`;
}

// "widget:<id>" or "stack:<id>": an item's key, unique on a page.
export function get_item_key(type, id) {
  return `${type}:${id}`;
}

// A widget as an item: { key, type, id, record, members, layout, pinned_paths }, where
// record is the widget (or stack) and members a stack's widgets.
export function to_widget_item(widget) {
  return { key: get_item_key('widget', widget.id), type: 'widget', id: widget.id, record: widget, members: null, layout: widget.layout, pinned_paths: widget.pinned_paths };
}

// A stack as an item, with its widgets in order (any deleted ones left out).
export function to_stack_item(stack, widgets) {
  const members = stack.widget_ids.map((widget_id) => widgets.find((widget) => widget.id === widget_id)).filter(Boolean);
  return { key: get_item_key('stack', stack.id), type: 'stack', id: stack.id, record: stack, members, layout: stack.layout, pinned_paths: stack.pinned_paths };
}

// Every item: each stack with widgets left in it, and each widget that isn't in a stack.
export function build_layout_items(widgets, stacks) {
  const stacked_ids = new Set(stacks.flatMap((stack) => stack.widget_ids));
  const stack_items = stacks.map((stack) => to_stack_item(stack, widgets)).filter((stack_item) => stack_item.members.length > 0);
  const widget_items = widgets.filter((widget) => !stacked_ids.has(widget.id)).map(to_widget_item);
  return [...widget_items, ...stack_items];
}

// The stack (as an item) that the widget widget_id is in, or null.
export function find_stack_item(stacks, widgets, widget_id) {
  const stack = stacks.find((other_stack) => other_stack.widget_ids.includes(widget_id));
  return stack ? to_stack_item(stack, widgets) : null;
}

// The title an item goes by: a widget's own, or the widget a stack is showing.
export function get_item_title(item) {
  return item.type === 'stack' ? find_active_member(item).title : item.record.title;
}

// The widget a stack shows now: its active one, or its first.
export function find_active_member(stack_item) {
  return stack_item.members.find((member) => member.id === stack_item.record.active_widget_id) ?? stack_item.members[0];
}

// The widgets an item holds: a stack's members, or the widget itself.
export function list_item_widgets(item) {
  return item.type === 'stack' ? item.members : [item.record];
}

// The items on the page at pathname, split into docked and floating. Hidden items show on
// no page. Floating windows need room, so below the shelf's grid width (can_float false)
// they're shown docked.
export function split_page_items(items, pathname, can_float) {
  const page_items = items.filter((item) => !item.layout.is_hidden && is_pinned_here(item.pinned_paths, pathname));
  const is_floating = (item) => can_float && item.layout.mode === 'floating';
  return { docked: sort_shelf_items(page_items.filter((item) => !is_floating(item))), floating: page_items.filter(is_floating) };
}

// The shelf's order: items never moved (no position) first, as they came, then the rest by position.
export function sort_shelf_items(items) {
  const unplaced = items.filter((item) => item.layout.position === null);
  const placed = items.filter((item) => item.layout.position !== null).sort((first, second) => first.layout.position - second.layout.position);
  return [...unplaced, ...placed];
}

// keys with key moved by offset places (Infinity or -Infinity for the end or the start),
// stopping at the ends.
export function move_by(keys, key, offset) {
  const from_index = keys.indexOf(key);
  const to_index = Math.min(keys.length - 1, Math.max(0, from_index + offset));
  const remaining_keys = keys.filter((other_key) => other_key !== key);
  return [...remaining_keys.slice(0, to_index), key, ...remaining_keys.slice(to_index)];
}

// The drop sides that put an item before the one it's dropped on.
const SIDES_BEFORE = ['left', 'above'];

// keys with dragged_key dropped on side ("left", "right", "above" or "below") of target_key.
export function drop_beside(keys, dragged_key, target_key, side) {
  const remaining_keys = keys.filter((other_key) => other_key !== dragged_key);
  const target_index = remaining_keys.indexOf(target_key) + (SIDES_BEFORE.includes(side) ? 0 : 1);
  return [...remaining_keys.slice(0, target_index), dragged_key, ...remaining_keys.slice(target_index)];
}

// The share of an item, from each edge, that counts as its edge rather than its middle.
const DROP_EDGE_SHARE = 0.3;

// Where the pointer is over an item while dragging another: its "center" (to stack them),
// or a side to drop beside it. Items sharing a row split "left" and "right"; one that fills
// its row splits "above" and "below".
export function find_drop_side(target_rect, shelf_width, pointer_x, pointer_y) {
  const is_in_middle =
    pointer_x > target_rect.left + target_rect.width * DROP_EDGE_SHARE &&
    pointer_x < target_rect.left + target_rect.width * (1 - DROP_EDGE_SHARE) &&
    pointer_y > target_rect.top + target_rect.height * DROP_EDGE_SHARE &&
    pointer_y < target_rect.top + target_rect.height * (1 - DROP_EDGE_SHARE);
  if (is_in_middle) return 'center';
  const is_full_row = target_rect.width >= shelf_width * WIDGET_FULL_ROW_SHARE;
  if (is_full_row) return pointer_y < target_rect.top + target_rect.height / 2 ? 'above' : 'below';
  return pointer_x < target_rect.left + target_rect.width / 2 ? 'left' : 'right';
}

// value kept between low and high (low wins when high is below it).
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

// The edges of bounds: { left, top, right, bottom }. Bounds are { left?, top?, width,
// height }: the space a floating window is kept in (left and top default to 0).
function get_bounds_edges(bounds) {
  const left = bounds.left ?? 0;
  const top = bounds.top ?? 0;
  return { left, top, right: left + bounds.width, bottom: top + bounds.height };
}

// A floating window's rect moved back inside bounds where it fits.
export function clamp_float_rect(rect, bounds) {
  const edges = get_bounds_edges(bounds);
  return {
    ...rect,
    x: Math.round(clamp(rect.x, edges.left, edges.right - rect.width)),
    y: Math.round(clamp(rect.y, edges.top, edges.bottom - rect.height)),
  };
}

// A window let go near an edge of bounds settles WIDGET_EDGE_MARGIN_PX from it, like a magnet.
export function snap_float_rect(rect, bounds) {
  const edges = get_bounds_edges(bounds);
  const snapped_rect = { ...rect };
  if (rect.x - edges.left < WIDGET_SNAP_DISTANCE_PX) snapped_rect.x = edges.left + WIDGET_EDGE_MARGIN_PX;
  if (edges.right - (rect.x + rect.width) < WIDGET_SNAP_DISTANCE_PX) snapped_rect.x = edges.right - rect.width - WIDGET_EDGE_MARGIN_PX;
  if (rect.y - edges.top < WIDGET_SNAP_DISTANCE_PX) snapped_rect.y = edges.top + WIDGET_EDGE_MARGIN_PX;
  if (edges.bottom - (rect.y + rect.height) < WIDGET_SNAP_DISTANCE_PX) snapped_rect.y = edges.bottom - rect.height - WIDGET_EDGE_MARGIN_PX;
  return snapped_rect;
}

// Which way each edge or corner grows a window: [horizontal, vertical], where -1 moves the
// left or top edge and 1 the right or bottom one.
export const RESIZE_DIRECTIONS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };

// A floating window's rect after its edge or corner (direction) is dragged by dx, dy:
// the opposite edges stay put, and the size stays within the floating limits.
export function resize_float_rect(start_rect, direction, delta_x, delta_y) {
  const [horizontal, vertical] = RESIZE_DIRECTIONS[direction];
  const resized_rect = { ...start_rect };
  if (horizontal !== 0) {
    resized_rect.width = Math.round(clamp(start_rect.width + horizontal * delta_x, WIDGET_FLOAT_WIDTH.min, WIDGET_FLOAT_WIDTH.max));
    if (horizontal < 0) resized_rect.x = start_rect.x + start_rect.width - resized_rect.width;
  }
  if (vertical !== 0) {
    resized_rect.height = Math.round(clamp(start_rect.height + vertical * delta_y, WIDGET_FLOAT_HEIGHT.min, WIDGET_FLOAT_HEIGHT.max));
    if (vertical < 0) resized_rect.y = start_rect.y + start_rect.height - resized_rect.height;
  }
  return resized_rect;
}

// Where a floating window opens before it's been moved: near the top right of bounds, each
// one (cascade_index) a little lower than the last. Screen windows start below the top
// bar's height; page ones at the top of the page.
export function place_new_float(bounds, width, cascade_index, anchor) {
  const edges = get_bounds_edges(bounds);
  const top = edges.top + (anchor === 'screen' ? FLOAT_TOP_PX : WIDGET_EDGE_MARGIN_PX);
  return { x: Math.max(edges.left, edges.right - width - WIDGET_EDGE_MARGIN_PX), y: top + cascade_index * FLOAT_CASCADE_PX };
}
