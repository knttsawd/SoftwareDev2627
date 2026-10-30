import { MINUTES_PER_HOUR, WIDGET_HEIGHT_LIMITS, WIDGET_PIN_EVERYWHERE } from '../config/constants.js';
import { DASHBOARD_PAGES } from '../config/dashboard_pages.js';
import { install_app_kit } from './app_kit.js';

// Helpers for showing the widgets the assistant makes.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;

// What an app widget's page may do: run its own inline script and styles, and nothing
// else. No network (so it can't send anything anywhere), no forms, no plugins. The frame
// is also sandboxed without same-origin access, so it can't read the student's login.
export const APP_WIDGET_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'";

// The message an app widget's page sends its frame with how tall its content is.
export const APP_HEIGHT_MESSAGE = 'studyapp:widget-height';
// The message the frame sends an app widget's page with the widget's shape
// ({ type, size, orientation }, see describe_shape), so the app can lay itself out for it.
export const APP_SHAPE_MESSAGE = 'studyapp:widget-shape';
// The message an app widget's page sends to save its data (kit.save), and the most it may
// save as JSON: under the server's widget state limit, leaving room for the rest.
export const APP_SAVE_MESSAGE = 'studyapp:widget-save';
export const APP_STATE_MAX_LENGTH = 8000;
const APP_SIZES = ['compact', 'regular', 'large'];
const APP_ORIENTATIONS = ['landscape', 'square', 'portrait'];

// The design kit's colors in each theme. The frame can't reach the app's stylesheet, so
// these are copies of the theme.css values. The soft panel and line colors are see-through,
// so apps sit well on solid, glass and tinted widgets alike.
const APP_COLORS = {
  light: { scheme: 'light', text: '#0f172a', muted: '#475569', soft: 'rgb(15 23 42 / 0.045)', line: 'rgb(15 23 42 / 0.12)', raised: '#ffffff', on_accent: '#ffffff' },
  dark: { scheme: 'dark', text: '#f1f5f9', muted: '#cbd5e1', soft: 'rgb(255 255 255 / 0.07)', line: 'rgb(255 255 255 / 0.14)', raised: '#334155', on_accent: '#0f172a' },
};

// Each widget accent (WIDGET_ACCENT_DETAILS) as the kit's --accent. In light mode these are
// a step darker than the accents in theme.css, so white button text reads at 4.5:1; in dark
// mode they're the same light accents, under dark text.
const APP_ACCENTS = {
  light: { indigo: '#4f46e5', teal: '#0f766e', sky: '#0369a1', green: '#15803d', amber: '#b45309', rose: '#be123c', slate: '#475569' },
  dark: { indigo: '#818cf8', teal: '#2dd4bf', sky: '#38bdf8', green: '#4ade80', amber: '#fbbf24', rose: '#fb7185', slate: '#94a3b8' },
};
const DEFAULT_APP_ACCENT = 'indigo';

// The design kit an app widget's page starts with, in the given theme ("light" or "dark")
// and widget accent. The page is see-through, so the widget's own look shows behind it.
// It gives the CSS variables, layout classes and styled controls the widget guide tells the
// AI about, and the size classes: .only-compact, .hide-compact and .only-large follow
// <html data-size>. :where() keeps the kit weaker than any style the AI's html sets itself.
export function build_app_styles(theme, accent = DEFAULT_APP_ACCENT) {
  const colors = APP_COLORS[theme];
  const accent_color = APP_ACCENTS[theme][accent] ?? APP_ACCENTS[theme][DEFAULT_APP_ACCENT];
  return [
    `:root{color-scheme:${colors.scheme};--accent:${accent_color};--on-accent:${colors.on_accent};--text:${colors.text};--muted:${colors.muted};--soft:${colors.soft};--line:${colors.line};--raised:${colors.raised};--radius:12px}`,
    '*,*::before,*::after{box-sizing:border-box}',
    'html,body{background:transparent}',
    'body{margin:4px;font:15px/1.5 Inter,system-ui,sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}',
    ':where(h1,h2,h3,h4,p,ul,ol,figure){margin:0}',
    ':where(h1,h2,h3,h4){font-weight:650;line-height:1.25;letter-spacing:-0.01em}:where(h1){font-size:1.25rem}:where(h2){font-size:1.125rem}:where(h3,h4){font-size:1rem}',
    ':where(.stack){display:flex;flex-direction:column;gap:12px}',
    ':where(.row){display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
    ':where(.grid){display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}',
    ':where(.tile){background:var(--soft);border:1px solid var(--line);border-radius:var(--radius);padding:12px}',
    ':where(.big){font-size:2.25rem;font-weight:700;line-height:1.1;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}',
    ':where(.label){font-size:0.75rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted)}',
    ':where(.muted){color:var(--muted)}',
    ':where(.pill){display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;background:var(--soft);border:1px solid var(--line);font-size:0.8125rem;font-weight:600}',
    ':where(button){font:inherit;font-weight:600;color:var(--on-accent);background:var(--accent);border:1px solid transparent;border-radius:999px;padding:7px 16px;min-height:36px;cursor:pointer;transition:filter .15s,transform .1s,background-color .15s}',
    ':where(button:hover){filter:brightness(1.08)}:where(button:active){transform:scale(.97)}:where(button:disabled){opacity:.45;cursor:not-allowed}',
    ':where(button.secondary){color:var(--text);background:var(--soft);border-color:var(--line)}',
    ':where(button.ghost){color:var(--text);background:transparent}:where(button.ghost:hover){background:var(--soft);filter:none}',
    ':where(input,select,textarea){font:inherit;color:inherit;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:6px 10px;min-height:36px;max-width:100%}',
    ':where(input[type=range],input[type=checkbox],input[type=radio]){accent-color:var(--accent);min-height:0;padding:0;border:0;background:none}',
    ':where(label){font-weight:500}',
    ':where(table){border-collapse:collapse;width:100%}:where(th,td){border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}:where(th){font-size:0.75rem;font-weight:600;color:var(--muted)}',
    ':where(canvas,svg,img){display:block;max-width:100%}',
    // Calculators: a display (an expression line over the result) and a keypad of rounded
    // keys, soft by default, accent for the main ones, .wide for keys two columns across.
    ':where(.display){display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;gap:2px;min-height:72px;padding:10px 14px;background:var(--soft);border:1px solid var(--line);border-radius:var(--radius);text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}',
    ':where(.display .expression){min-height:1.3em;font-size:0.875rem;color:var(--muted)}:where(.display .result){font-size:2rem;font-weight:650;line-height:1.15;letter-spacing:-0.02em}',
    ':where(.keypad){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}',
    ':where(.keypad>button){min-height:44px;padding:6px;border-radius:14px;font-size:1.05rem;color:var(--text);background:var(--soft);border-color:var(--line)}',
    ':where(.keypad>button.accent){color:var(--on-accent);background:var(--accent);border-color:transparent}:where(.keypad>button.muted){color:var(--muted)}:where(.wide){grid-column:span 2}',
    // Forms: a .field is a label above its input; .segmented is a pill of choices, the
    // chosen one marked with aria-pressed="true".
    ':where(.field){display:flex;flex:1 1 120px;flex-direction:column;gap:4px;min-width:0}:where(.field>label){font-size:0.8125rem;color:var(--muted)}',
    ':where(.segmented){display:inline-flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:999px;background:var(--soft);border:1px solid var(--line)}',
    ':where(.segmented>button){min-height:30px;padding:4px 12px;color:var(--muted);background:transparent;border-color:transparent}:where(.segmented>button[aria-pressed="true"]){color:var(--text);background:var(--raised);box-shadow:0 1px 2px rgb(0 0 0 / .14)}',
    ':focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    'html[data-size="compact"] .hide-compact,html:not([data-size="compact"]) .only-compact,html:not([data-size="large"]) .only-large{display:none!important}',
    'html[data-size="compact"] body{font-size:14px}html[data-size="compact"] :where(.big){font-size:1.75rem}html[data-size="large"] :where(.big){font-size:3rem}',
    'html[data-size="compact"] :where(.keypad){gap:4px}html[data-size="compact"] :where(.keypad>button){min-height:36px;border-radius:11px;font-size:0.95rem}html[data-size="compact"] :where(.display .result){font-size:1.5rem}',
    'html[data-size="large"] :where(.keypad){gap:8px}html[data-size="large"] :where(.keypad>button){min-height:52px}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}',
  ].join('');
}

// The page's kit (window.kit, see app_kit.js), started with the widget's saved app data.
// It also sets <html data-size> and data-orientation from the frame's shape message. "<" is
// escaped so saved data can never close the script early.
function build_app_kit_script(state) {
  const config = {
    shape_message: APP_SHAPE_MESSAGE,
    save_message: APP_SAVE_MESSAGE,
    sizes: APP_SIZES,
    orientations: APP_ORIENTATIONS,
    state: state ?? null,
    state_max_length: APP_STATE_MAX_LENGTH,
  };
  return `<script>(${install_app_kit.toString()})(window,${JSON.stringify(config).replaceAll('<', '\\u003c')})</script>`;
}

// Tells the frame how tall the page's content is (the body and its margins), now and
// whenever it grows or shrinks. The whole document is never shorter than the frame, so it
// can't be used: the frame could grow but never shrink back. It goes first in the body, so
// unfinished markup in the AI's html can never swallow it.
const APP_HEIGHT_SCRIPT = `<script>(function(){function report(){var s=getComputedStyle(document.body);parent.postMessage({type:'${APP_HEIGHT_MESSAGE}',height:document.body.offsetHeight+parseFloat(s.marginTop)+parseFloat(s.marginBottom)},'*')}addEventListener('load',report);new ResizeObserver(report).observe(document.body)})()</script>`;

// The full page for an app widget's frame, with the design kit for theme and accent, and
// window.kit holding the app's saved data (state). It starts at the regular size until the
// frame sends the widget's shape. The policy comes first in <head>, so nothing in the AI's
// html can loosen it; the height script goes first in the body.
export function build_app_document(html, theme = 'light', accent = DEFAULT_APP_ACCENT, state = null) {
  return [
    '<!doctype html><html lang="en" data-size="regular"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${APP_WIDGET_POLICY}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${build_app_styles(theme, accent)}</style>${build_app_kit_script(state)}`,
    `</head><body>${APP_HEIGHT_SCRIPT}${html}</body></html>`,
  ].join('');
}

// A height an app widget reported, kept within WIDGET_HEIGHT_LIMITS, or null when it
// isn't a number.
export function clamp_widget_height(reported_height) {
  if (!Number.isFinite(reported_height)) return null;
  return Math.min(WIDGET_HEIGHT_LIMITS.max, Math.max(WIDGET_HEIGHT_LIMITS.min, Math.ceil(reported_height)));
}

// "/dashboard/learn" for "/dashboard/learn/anything".
export function get_page_path(pathname) {
  return pathname.split('/').slice(0, 3).join('/');
}

// True when a widget pinned to pinned_paths shows on the page at pathname.
export function is_pinned_here(pinned_paths, pathname) {
  return pinned_paths.includes(WIDGET_PIN_EVERYWHERE) || pinned_paths.includes(get_page_path(pathname));
}

// Where a widget shows, in words: "Every page", "Learn", "Learn and Quiz", "Learn, Quiz and
// Schedule" or "No pages".
export function describe_pins(pinned_paths) {
  if (pinned_paths.includes(WIDGET_PIN_EVERYWHERE)) return 'Every page';
  const labels = pinned_paths.map((pinned_path) => find_page(pinned_path)?.label).filter(Boolean);
  if (labels.length === 0) return 'No pages';
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

// pinned_paths with page_path added or taken away. A widget on every page, losing one page,
// is on all the others.
export function toggle_pinned_page(pinned_paths, page_path) {
  const pages = pinned_paths.includes(WIDGET_PIN_EVERYWHERE) ? list_dashboard_paths() : pinned_paths;
  return pages.includes(page_path) ? pages.filter((path) => path !== page_path) : list_dashboard_paths().filter((path) => path === page_path || pages.includes(path));
}

// Every dashboard page's path, in sidebar order.
export function list_dashboard_paths() {
  return DASHBOARD_PAGES.map((dashboard_page) => `/dashboard/${dashboard_page.path}`);
}

// The dashboard page at a path, or undefined.
function find_page(page_path) {
  return DASHBOARD_PAGES.find((dashboard_page) => `/dashboard/${dashboard_page.path}` === page_path);
}

// Which items of a checklist block are ticked, from the widget's state.
export function get_checked_items(state, block_index, item_count) {
  const saved_items = state?.checked?.[block_index] ?? [];
  return Array.from({ length: item_count }, (unused_value, item_index) => saved_items[item_index] === true);
}

// The widget's state with one checklist item ticked or unticked.
export function toggle_checked_item(state, block_index, item_index, item_count) {
  const checked_items = get_checked_items(state, block_index, item_count);
  checked_items[item_index] = !checked_items[item_index];
  return { ...state, checked: { ...state?.checked, [block_index]: checked_items } };
}

// A number of seconds in whole units: { days, hours, minutes, seconds }.
export function split_seconds(total_seconds) {
  return {
    days: Math.floor(total_seconds / SECONDS_PER_DAY),
    hours: Math.floor(total_seconds / SECONDS_PER_HOUR) % HOURS_PER_DAY,
    minutes: Math.floor(total_seconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR,
    seconds: total_seconds % SECONDS_PER_MINUTE,
  };
}

// How long until target, in whole units: { is_past, days, hours, minutes, seconds }.
export function split_countdown(target, now) {
  const seconds_left = Math.ceil((new Date(target).getTime() - now.getTime()) / MS_PER_SECOND);
  if (seconds_left <= 0) return { is_past: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  return { is_past: false, ...split_seconds(seconds_left) };
}

// The units worth showing for the time left, largest first, sized to it: days, hours and
// minutes when it's a day or more away; hours, minutes and seconds within a day; minutes and
// seconds within an hour. Each is { value, label }.
export function pick_countdown_units(time_left) {
  const unit = (value, singular, plural) => ({ value, label: value === 1 ? singular : plural });
  const minutes = unit(time_left.minutes, 'minute', 'minutes');
  const seconds = unit(time_left.seconds, 'second', 'seconds');
  if (time_left.days > 0) return [unit(time_left.days, 'day', 'days'), unit(time_left.hours, 'hour', 'hours'), minutes];
  if (time_left.hours > 0) return [unit(time_left.hours, 'hour', 'hours'), minutes, seconds];
  return [minutes, seconds];
}

// How long until target, in words, with the two largest units worth saying: "3 days, 4
// hours left", "25 minutes, 10 seconds left", "40 seconds left", or that it's here.
export function describe_countdown(target, now) {
  const time_left = split_countdown(target, now);
  if (time_left.is_past) return { is_past: true, text: "It's here" };
  const parts = pick_countdown_units(time_left)
    .filter((unit) => unit.value > 0)
    .slice(0, 2)
    .map((unit) => `${unit.value} ${unit.label}`);
  return { is_past: false, text: `${parts.join(', ')} left` };
}

// A number of seconds as a clock: "25:00", "1:05:09".
export function format_clock(total_seconds) {
  const { days, hours, minutes, seconds } = split_seconds(Math.max(0, Math.ceil(total_seconds)));
  const two_digits = (value) => String(value).padStart(2, '0');
  const total_hours = days * HOURS_PER_DAY + hours;
  return total_hours > 0 ? `${total_hours}:${two_digits(minutes)}:${two_digits(seconds)}` : `${minutes}:${two_digits(seconds)}`;
}

// When a countdown ends, in words: "Today at 3:30 PM", "Tomorrow at 9:00 AM", or the date.
export function describe_countdown_end(target, now) {
  const end = new Date(target);
  const days_away = Math.round((new Date(end).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / (SECONDS_PER_DAY * MS_PER_SECOND));
  const time = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days_away === 0) return `Today at ${time}`;
  if (days_away === 1) return `Tomorrow at ${time}`;
  return end.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// A timer block's state, from the widget's state ({ timers: { [block_index]: { ends_at } or
// { remaining_ms } } }): { status, remaining_ms }, where status is "ready" (not started, or
// reset), "running", "paused" or "done".
export function read_timer(state, block_index, seconds, now) {
  const saved = state?.timers?.[block_index];
  const full_ms = seconds * MS_PER_SECOND;
  if (saved?.ends_at) {
    const remaining_ms = new Date(saved.ends_at).getTime() - now.getTime();
    return remaining_ms > 0 ? { status: 'running', remaining_ms } : { status: 'done', remaining_ms: 0 };
  }
  if (Number.isFinite(saved?.remaining_ms)) return { status: 'paused', remaining_ms: Math.min(full_ms, Math.max(0, saved.remaining_ms)) };
  return { status: 'ready', remaining_ms: full_ms };
}

// The widget's state with one timer started from remaining_ms (running until now plus that),
// paused with remaining_ms left, or reset (saved null).
export function save_timer(state, block_index, saved_timer) {
  const timers = { ...state?.timers };
  if (saved_timer === null) delete timers[block_index];
  else timers[block_index] = saved_timer;
  return { ...state, timers };
}
