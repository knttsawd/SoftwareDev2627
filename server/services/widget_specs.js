import { Script } from 'node:vm';
import {
  DASHBOARD_PATH_PATTERN,
  DEFAULT_WIDGET_LAYOUT,
  MAX_PINNED_PAGES,
  MAX_STACK_WIDGETS,
  MAX_WIDGET_STACKS,
  MAX_WIDGETS,
  WIDGET_ACCENTS,
  WIDGET_ANCHORS,
  WIDGET_APPEARANCES,
  WIDGET_BLOCK_TYPES,
  WIDGET_CONTENT_HEIGHT,
  WIDGET_CONTENT_SIZES,
  WIDGET_CORNERS,
  WIDGET_FLOAT_HEIGHT,
  WIDGET_FLOAT_OFFSET,
  WIDGET_FLOAT_WIDTH,
  WIDGET_GLASS_TINTS,
  WIDGET_HEIGHT,
  WIDGET_HTML_MAX_LENGTH,
  WIDGET_ITEM_MAX_LENGTH,
  WIDGET_KINDS,
  WIDGET_LIVE_SOURCES,
  WIDGET_LOOK_NUMBERS,
  WIDGET_MAX_BLOCKS,
  WIDGET_MAX_ITEMS,
  WIDGET_MODES,
  WIDGET_PIN_EVERYWHERE,
  WIDGET_SHADOWS,
  WIDGET_STACK_VIEWS,
  WIDGET_STATE_MAX_LENGTH,
  WIDGET_TEXT_MAX_LENGTH,
  WIDGET_TIMER_SECONDS,
  WIDGET_TITLE_MAX_LENGTH,
  WIDGET_WIDTHS,
} from '../config/constants.js';
import { to_iso_timestamp } from './event_validators.js';

// What a widget may contain. Widgets are written by the AI, so everything is checked and
// cut to size here, and anything unusable is dropped rather than stored.
//
// A "card" is { blocks: [block] }, each block { type, title? } plus:
//   markdown    { markdown }                         text with headings, lists and links
//   checklist   { items: [text] }                    ticks are kept in the widget's state
//   countdown   { label, target }                    to a date-time (an exam, a deadline)
//   timer       { label, seconds }                   a length of time the student starts (a
//                                                    30 minute timer, a pomodoro)
//   flashcards  { cards: [{ front, back }] }
//   links       { links: [{ label, path }] }         paths inside the dashboard only
//   live        { source, skill_id? }                the student's own data (WIDGET_LIVE_SOURCES)
// An "app" is { html, height }: a small self-contained page the client runs in a sandbox.

// Trimmed text cut to max_length, or '' for anything that isn't text.
export function clip_text(value, max_length) {
  return typeof value === 'string' ? value.trim().slice(0, max_length) : '';
}

// A dashboard address the widget may link to: "/dashboard/<page>", with an optional query.
export function is_dashboard_link(path) {
  if (typeof path !== 'string') return false;
  const [page_path, query = ''] = path.split('?');
  return DASHBOARD_PATH_PATTERN.test(page_path) && !/[\s<>"']/.test(query);
}

// The usable items of a list, made by make_item (which returns null to drop one).
function clean_list(values, make_item) {
  return (Array.isArray(values) ? values : []).map(make_item).filter(Boolean).slice(0, WIDGET_MAX_ITEMS);
}

// Each block type's checker: the cleaned block's own fields, or null when it's unusable.
const BLOCK_CLEANERS = {
  markdown: (block) => {
    const markdown = clip_text(block.markdown, WIDGET_TEXT_MAX_LENGTH);
    return markdown ? { markdown } : null;
  },
  checklist: (block) => {
    const items = clean_list(block.items, (item) => clip_text(item, WIDGET_ITEM_MAX_LENGTH) || null);
    return items.length > 0 ? { items } : null;
  },
  countdown: (block) => {
    const label = clip_text(block.label, WIDGET_TITLE_MAX_LENGTH);
    const target = to_iso_timestamp(block.target);
    return label && target ? { label, target } : null;
  },
  timer: (block) => {
    const label = clip_text(block.label, WIDGET_TITLE_MAX_LENGTH);
    const seconds = Math.round(Number(block.seconds));
    if (!label || !Number.isFinite(seconds)) return null;
    return { label, seconds: Math.min(WIDGET_TIMER_SECONDS.max, Math.max(WIDGET_TIMER_SECONDS.min, seconds)) };
  },
  flashcards: (block) => {
    const cards = clean_list(block.cards, (card) => {
      const front = clip_text(card?.front, WIDGET_ITEM_MAX_LENGTH);
      const back = clip_text(card?.back, WIDGET_ITEM_MAX_LENGTH);
      return front && back ? { front, back } : null;
    });
    return cards.length > 0 ? { cards } : null;
  },
  links: (block) => {
    const links = clean_list(block.links, (link) => {
      const label = clip_text(link?.label, WIDGET_TITLE_MAX_LENGTH);
      return label && is_dashboard_link(link?.path) ? { label, path: link.path } : null;
    });
    return links.length > 0 ? { links } : null;
  },
  live: (block) => {
    if (!WIDGET_LIVE_SOURCES.includes(block.source)) return null;
    return { source: block.source, skill_id: typeof block.skill_id === 'string' && block.skill_id ? block.skill_id : null };
  },
};

// One block, cleaned, or null when its type is unknown or it has nothing usable.
export function clean_widget_block(raw_block) {
  if (!raw_block || !WIDGET_BLOCK_TYPES.includes(raw_block.type)) return null;
  const block_fields = BLOCK_CLEANERS[raw_block.type](raw_block);
  if (!block_fields) return null;
  const title = clip_text(raw_block.title, WIDGET_TITLE_MAX_LENGTH);
  return { type: raw_block.type, ...(title ? { title } : {}), ...block_fields };
}

// Signs that an app's html lays itself out for small sizes: the design kit's size classes,
// the data-size attribute it sets, CSS container or media queries, or kit.on_size in its script.
export const APP_SIZE_HOOKS = ['only-compact', 'hide-compact', 'only-large', 'data-size', '@container', '@media', 'kit.on_size'];
export const APP_SIZE_ERROR =
  'Apps must also work when small. Add a compact version: the kit\'s .only-compact and .hide-compact classes, or [data-size="compact"] styles (see the widget guide).';

// Pairs of tags that must balance in an app's html: an unclosed one would swallow the rest
// of the page.
const APP_PAIRED_TAGS = [
  { name: '<script>', open: /<script\b/gi, close: /<\/script\s*>/gi },
  { name: '<style>', open: /<style\b/gi, close: /<\/style\s*>/gi },
  { name: '<textarea>', open: /<textarea\b/gi, close: /<\/textarea\s*>/gi },
  { name: 'comment', open: /<!--/g, close: /-->/g },
];

// What's wrong when an app's html is cut off or unfinished, or null: it has no script, a
// paired tag isn't closed, or it stops in the middle of a tag.
export function find_incomplete_html(html) {
  if (!/<script\b/i.test(html)) return 'An app needs its <script>';
  const count = (pattern) => html.match(pattern)?.length ?? 0;
  const unclosed = APP_PAIRED_TAGS.find((tag) => count(tag.open) !== count(tag.close));
  if (unclosed) return `The html is cut off or has an unclosed ${unclosed.name}; return the whole app`;
  if (html.lastIndexOf('<') > html.lastIndexOf('>')) return 'The html stops in the middle of a tag; return the whole app';
  return null;
}

// What's wrong with the first of an app's scripts that doesn't parse as JavaScript, or null.
// A script with a syntax error (a bad regular expression, a missing bracket) doesn't run at
// all, so the app would look right and do nothing. The scripts are only compiled, never run.
export function find_script_error(html) {
  for (const [, code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      new Script(code);
    } catch (script_error) {
      return `The script has a syntax error (${script_error.message}); fix it and return the whole app`;
    }
  }
  return null;
}

// Code the app sandbox blocks, so an app using it would quietly not work, and what to do
// instead (window.kit gives the safe versions).
export const APP_BLOCKED_CODE = [
  { pattern: /\beval\s*\(|\bnew\s+Function\b/, problem: 'eval() and new Function() are blocked; use kit.calc(expression) for maths' },
  { pattern: /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/, problem: 'Storage is blocked; use kit.save(data) and kit.load()' },
  { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\b/, problem: 'Apps have no network; put the data in the app' },
  { pattern: /(?:^|[^\w.])(?:window\.)?(?:alert|confirm|prompt)\s*\(/, problem: 'Popups are blocked; show messages in the page' },
  { pattern: /\bset(?:Timeout|Interval)\s*\(\s*['"`]/, problem: 'Give setTimeout and setInterval a function, not a string' },
];

// A card's or an app's spec, cleaned. Returns { error } or { spec }. An app must be whole,
// with scripts that parse (find_incomplete_html, find_script_error), show it handles small
// sizes (APP_SIZE_HOOKS), so the AI always writes a compact version too, and not use code
// the sandbox blocks (APP_BLOCKED_CODE).
export function clean_widget_spec(kind, raw_spec) {
  if (kind === 'card') {
    const blocks = (Array.isArray(raw_spec?.blocks) ? raw_spec.blocks : []).map(clean_widget_block).filter(Boolean).slice(0, WIDGET_MAX_BLOCKS);
    if (blocks.length === 0) return { error: `A card needs at least one usable block (${WIDGET_BLOCK_TYPES.join(', ')})` };
    return { spec: { blocks } };
  }
  const html = typeof raw_spec?.html === 'string' ? raw_spec.html.trim() : '';
  if (!html) return { error: 'An app needs its html' };
  if (html.length > WIDGET_HTML_MAX_LENGTH) return { error: `Keep the app under ${WIDGET_HTML_MAX_LENGTH} characters of html` };
  const incomplete_problem = find_incomplete_html(html) ?? find_script_error(html);
  if (incomplete_problem) return { error: incomplete_problem };
  if (!APP_SIZE_HOOKS.some((size_hook) => html.includes(size_hook))) return { error: APP_SIZE_ERROR };
  const blocked_code = APP_BLOCKED_CODE.find((blocked) => blocked.pattern.test(html));
  if (blocked_code) return { error: blocked_code.problem };
  const height = Number.isInteger(raw_spec.height)
    ? Math.min(WIDGET_HEIGHT.max, Math.max(WIDGET_HEIGHT.min, raw_spec.height))
    : WIDGET_HEIGHT.default;
  return { spec: { html, height } };
}

// Where a widget or stack shows (pinned_paths), cleaned: a list of dashboard page paths
// (repeats dropped), ["*"] for every page ("*" anywhere in the list wins), or [] for none.
// Returns { error, pinned_paths }.
export function clean_pinned_paths(input) {
  const PIN_ERROR = `Pin to a list of dashboard pages like ["/dashboard/learn"], ["${WIDGET_PIN_EVERYWHERE}"] for every page, or [] for none`;
  if (!Array.isArray(input) || input.length > MAX_PINNED_PAGES) return { error: PIN_ERROR, pinned_paths: null };
  if (!input.every((path) => path === WIDGET_PIN_EVERYWHERE || (typeof path === 'string' && DASHBOARD_PATH_PATTERN.test(path)))) {
    return { error: PIN_ERROR, pinned_paths: null };
  }
  if (input.includes(WIDGET_PIN_EVERYWHERE)) return { error: null, pinned_paths: [WIDGET_PIN_EVERYWHERE] };
  return { error: null, pinned_paths: [...new Set(input)] };
}

// A widget's saved state: any plain object that isn't too big.
export function validate_widget_state(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'State must be an object';
  if (JSON.stringify(state).length > WIDGET_STATE_MAX_LENGTH) return 'That state is too big to save';
  return null;
}

// Layout settings that take one of a list of values.
const LAYOUT_CHOICES = {
  width: { label: 'Width', choices: WIDGET_WIDTHS },
  mode: { label: 'Mode', choices: WIDGET_MODES },
  anchor: { label: 'Anchor', choices: WIDGET_ANCHORS },
  appearance: { label: 'Appearance', choices: WIDGET_APPEARANCES },
  accent: { label: 'Accent', choices: WIDGET_ACCENTS },
  content_size: { label: 'Content size', choices: WIDGET_CONTENT_SIZES },
  corners: { label: 'Corners', choices: WIDGET_CORNERS },
  shadow: { label: 'Shadow', choices: WIDGET_SHADOWS },
  glass_tint: { label: 'Glass tint', choices: WIDGET_GLASS_TINTS },
};
// Layout settings that are true or false.
const LAYOUT_SWITCHES = ['is_collapsed', 'is_hidden'];
// Layout settings in pixels, or null (fit the content, or not placed yet), kept within limits.
const LAYOUT_PIXELS = {
  height: { label: 'Height', limits: WIDGET_CONTENT_HEIGHT },
  x: { label: 'X', limits: WIDGET_FLOAT_OFFSET },
  y: { label: 'Y', limits: WIDGET_FLOAT_OFFSET },
  float_width: { label: 'Floating width', limits: WIDGET_FLOAT_WIDTH },
  float_height: { label: 'Floating height', limits: WIDGET_FLOAT_HEIGHT },
};

// The first problem with the layout changes, or null.
function find_layout_error(layout_input) {
  for (const [setting, { label, choices }] of Object.entries(LAYOUT_CHOICES)) {
    if (layout_input[setting] !== undefined && !choices.includes(layout_input[setting])) return `${label} must be one of: ${choices.join(', ')}`;
  }
  for (const [setting, { label }] of Object.entries(LAYOUT_PIXELS)) {
    const value = layout_input[setting];
    if (value !== undefined && value !== null && !Number.isFinite(value)) return `${label} must be a number of pixels, or null`;
  }
  for (const setting of Object.keys(WIDGET_LOOK_NUMBERS)) {
    if (layout_input[setting] !== undefined && !Number.isFinite(layout_input[setting])) return `${setting} must be a number`;
  }
  const bad_switch = LAYOUT_SWITCHES.find((setting) => layout_input[setting] !== undefined && typeof layout_input[setting] !== 'boolean');
  if (bad_switch) return `${bad_switch} must be true or false`;
  const { position } = layout_input;
  if (position !== undefined && position !== null && !(Number.isInteger(position) && position >= 0)) return 'Position must be a whole number from 0';
  return null;
}

// Layout changes (any of DEFAULT_WIDGET_LAYOUT's settings) merged into current_layout.
// Pixel values and look numbers are rounded and kept within their limits. Returns
// { error, layout }.
export function validate_widget_layout(layout_input, current_layout = DEFAULT_WIDGET_LAYOUT) {
  if (!layout_input || typeof layout_input !== 'object' || Array.isArray(layout_input)) return { error: 'Layout must be an object', layout: null };
  const error = find_layout_error(layout_input);
  if (error) return { error, layout: null };
  const layout = { ...DEFAULT_WIDGET_LAYOUT, ...current_layout };
  for (const setting of [...Object.keys(LAYOUT_CHOICES), ...LAYOUT_SWITCHES, 'position']) {
    if (layout_input[setting] !== undefined) layout[setting] = layout_input[setting];
  }
  for (const [setting, limits] of Object.entries(WIDGET_LOOK_NUMBERS)) {
    const value = layout_input[setting];
    if (value !== undefined) layout[setting] = Math.round(Math.min(limits.max, Math.max(limits.min, value)));
  }
  for (const [setting, { limits }] of Object.entries(LAYOUT_PIXELS)) {
    const value = layout_input[setting];
    if (value !== undefined) layout[setting] = value === null ? null : Math.round(Math.min(limits.max, Math.max(limits.min, value)));
  }
  return { error: null, layout };
}

// A new order for the docked widgets and stacks on a page:
// { items: [{ type: "widget" | "stack", id }] }, each item once. Returns an error or null.
export function validate_widget_order(input) {
  const items = input?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_WIDGETS + MAX_WIDGET_STACKS) {
    return 'Send the widgets and stacks in their new order';
  }
  const is_item = (item) => ['widget', 'stack'].includes(item?.type) && typeof item.id === 'string';
  if (!items.every(is_item) || new Set(items.map((item) => `${item.type}:${item.id}`)).size !== items.length) {
    return 'Each item must be a different { type: "widget" or "stack", id }';
  }
  return null;
}

// The widgets for a stack: 2 to MAX_STACK_WIDGETS different ids (at least min_count). Returns an error or null.
export function validate_stack_widget_ids(widget_ids, min_count = 2) {
  if (!Array.isArray(widget_ids) || widget_ids.length < min_count || widget_ids.length > MAX_STACK_WIDGETS) {
    return `A stack holds ${min_count} to ${MAX_STACK_WIDGETS} widgets`;
  }
  if (!widget_ids.every((widget_id) => typeof widget_id === 'string') || new Set(widget_ids).size !== widget_ids.length) {
    return 'Each widget can be in a stack once';
  }
  return null;
}

// A new stack: { widget_ids, view?, pinned_paths?, layout? }. Returns { field_errors, values }.
export function validate_new_stack(input) {
  const field_errors = {};
  const widget_ids_error = validate_stack_widget_ids(input?.widget_ids);
  if (widget_ids_error) field_errors.widget_ids = widget_ids_error;
  const view = input?.view ?? WIDGET_STACK_VIEWS[0];
  if (!WIDGET_STACK_VIEWS.includes(view)) field_errors.view = `View must be one of: ${WIDGET_STACK_VIEWS.join(', ')}`;
  const { error: pin_error, pinned_paths } = clean_pinned_paths(input?.pinned_paths ?? []);
  if (pin_error) field_errors.pinned_paths = pin_error;
  const { error: layout_error, layout } = validate_widget_layout(input?.layout ?? {});
  if (layout_error) field_errors.layout = layout_error;
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return { field_errors, values: { widget_ids: input.widget_ids, view, pinned_paths, layout } };
}

// A stack edit: any of { widget_ids (its widgets, reordered or fewer), view, active_widget_id,
// pinned_paths, layout }, at least one. Returns { field_errors, values }.
export function validate_stack_updates(input, current_layout = DEFAULT_WIDGET_LAYOUT) {
  const field_errors = {};
  const values = {};
  if (!['widget_ids', 'view', 'active_widget_id', 'pinned_paths', 'layout'].some((field_name) => input?.[field_name] !== undefined)) {
    return { field_errors: { form: 'Nothing to update' }, values };
  }
  if (input.widget_ids !== undefined) {
    const widget_ids_error = validate_stack_widget_ids(input.widget_ids, 1);
    if (widget_ids_error) field_errors.widget_ids = widget_ids_error;
    else values.widget_ids = input.widget_ids;
  }
  if (input.view !== undefined) {
    if (WIDGET_STACK_VIEWS.includes(input.view)) values.view = input.view;
    else field_errors.view = `View must be one of: ${WIDGET_STACK_VIEWS.join(', ')}`;
  }
  if (input.active_widget_id !== undefined) {
    if (input.active_widget_id === null || typeof input.active_widget_id === 'string') values.active_widget_id = input.active_widget_id;
    else field_errors.active_widget_id = 'Choose one of the stack\'s widgets';
  }
  if (input.pinned_paths !== undefined) {
    const { error: pin_error, pinned_paths } = clean_pinned_paths(input.pinned_paths);
    if (pin_error) field_errors.pinned_paths = pin_error;
    else values.pinned_paths = pinned_paths;
  }
  if (input.layout !== undefined) {
    const { error, layout } = validate_widget_layout(input.layout, current_layout);
    if (error) field_errors.layout = error;
    else values.layout = layout;
  }
  return { field_errors, values };
}

// A new widget: { title, kind, spec, pinned_paths?, layout? (changes to the default layout) }.
// Returns { field_errors, values }.
export function validate_new_widget(input) {
  const field_errors = {};
  const title = clip_text(input?.title, WIDGET_TITLE_MAX_LENGTH);
  if (!title) field_errors.title = 'Give the widget a title';
  if (!WIDGET_KINDS.includes(input?.kind)) field_errors.kind = `Choose one of: ${WIDGET_KINDS.join(', ')}`;
  const { error: pin_error, pinned_paths } = clean_pinned_paths(input?.pinned_paths ?? []);
  if (pin_error) field_errors.pinned_paths = pin_error;
  const { error: layout_error, layout } = validate_widget_layout(input?.layout ?? {});
  if (layout_error) field_errors.layout = layout_error;
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };

  const { spec, error } = clean_widget_spec(input.kind, input.spec);
  if (error) return { field_errors: { spec: error }, values: {} };
  return { field_errors, values: { title, kind: input.kind, spec, pinned_paths, layout } };
}

// An edit: any of { title, spec, state, pinned_paths, layout }, at least one. spec is
// checked against the widget's kind; layout changes are merged into current_layout.
// Returns { field_errors, values }.
export function validate_widget_updates(input, kind, current_layout = DEFAULT_WIDGET_LAYOUT) {
  const field_errors = {};
  const values = {};
  if (!['title', 'spec', 'state', 'pinned_paths', 'layout'].some((field_name) => input?.[field_name] !== undefined)) {
    return { field_errors: { form: 'Nothing to update' }, values };
  }
  if (input.title !== undefined) {
    values.title = clip_text(input.title, WIDGET_TITLE_MAX_LENGTH);
    if (!values.title) field_errors.title = 'Give the widget a title';
  }
  if (input.spec !== undefined) {
    const { spec, error } = clean_widget_spec(kind, input.spec);
    if (error) field_errors.spec = error;
    else values.spec = spec;
  }
  if (input.state !== undefined) {
    const state_error = validate_widget_state(input.state);
    if (state_error) field_errors.state = state_error;
    else values.state = input.state;
  }
  if (input.pinned_paths !== undefined) {
    const { error: pin_error, pinned_paths } = clean_pinned_paths(input.pinned_paths);
    if (pin_error) field_errors.pinned_paths = pin_error;
    else values.pinned_paths = pinned_paths;
  }
  if (input.layout !== undefined) {
    const { error, layout } = validate_widget_layout(input.layout, current_layout);
    if (error) field_errors.layout = error;
    else values.layout = layout;
  }
  return { field_errors, values };
}
