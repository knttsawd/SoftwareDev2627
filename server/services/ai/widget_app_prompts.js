import { AI_TASK_TIER, WIDGET_HEIGHT } from '../../config/constants.js';
import { CALCULATOR_APP, CONVERTER_APP } from './widget_app_examples.js';

// The app builder: writes the code for an app widget from the assistant's brief (what the
// app should do), or changes an app's code. Like the other prompts, it returns
// { system_prompt, user_prompt, json_schema, task_tier }; it uses the "build" tier, which
// thinks harder, since an app must work the first time. The mock provider doesn't use it.

export const WIDGET_APP_JSON_SCHEMA = {
  type: 'object',
  properties: {
    html: { type: 'string' },
    height: { type: 'integer' },
    summary: { type: 'string' },
  },
  required: ['html', 'height', 'summary'],
  additionalProperties: false,
};

// Everything the builder must know about where its app runs.
export const APP_BUILDER_GUIDE = [
  'You write one small interactive app for a widget in StudyApp, a study app for students. It must work perfectly the first time, look like a finished product, and work at every size.',
  '',
  'OUTPUT: JSON { html, height, summary }. html is the inside of <body> only: the markup, then at most one <style>, then one <script> (plain modern JavaScript, no modules). height is the pixels (120 to 900) the regular layout needs. summary is one sentence on what the app does.',
  '',
  'WHERE IT RUNS: a sandboxed frame with a strict policy. These are BLOCKED and fail silently, so never use them: eval(), new Function(), setTimeout or setInterval with a string, fetch and any network, localStorage, sessionStorage, IndexedDB, cookies, alert(), confirm(), prompt(), forms that submit, outside files (scripts, fonts, images; data: images are fine), the clipboard. <canvas> and inline SVG work.',
  '',
  'window.kit (already loaded) gives you what the sandbox blocks:',
  '- kit.calc(expression, { angle: "deg" | "rad" }) -> number. Safe maths for anything typed or built from buttons: + - * / ^ and brackets, × ÷ − √ too, implied multiplication (2pi, 3(4+1)), postfix ! and %, sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs ln log (base 10) log2 exp floor ceil round sign min max pow mod, constants pi π e tau, and "ans" (the last answer). Throws an Error whose message is written for students; show it.',
  '- kit.format(number, { digits: 10 }) -> a tidy string ("1,234.5", "1.5e20"). Always show numbers through it.',
  '- kit.units: { length, mass, time, temperature, volume, area, speed, data, energy, pressure, force, power, angle }, each a list of { id, label } (ids like "km", "mi", "C", "F", "K", "kg", "lb", "L", "gal", "m/s", "km/h", "kWh", "atm", "psi", "deg", "rad").',
  '- kit.convert(value, from_id, to_id) -> number, within one category. Throws for unknown or mismatched units.',
  '- kit.save(data) and kit.load(): remember a little JSON (settings, history, scores, progress) with the widget; load() gives null the first time. Save when the student changes something, never on every frame or on load.',
  '- kit.size() -> { size, orientation } and kit.on_size(listener) for layouts JavaScript must redo (for example redrawing a canvas).',
  '',
  'DESIGN KIT (already on the page; use it rather than your own colors, fonts or sizes):',
  '- CSS variables: --accent, --on-accent (text on the accent), --text, --muted, --soft (a soft panel), --line, --raised (a raised chip), --radius. The page is transparent and already matches light and dark mode; never set a background on body or hard-coded colors.',
  '- Layout: .stack (a column, 12px gaps), .row (a wrapping row), .grid (tiles that fit the width). Pieces: .tile (a soft rounded panel), .big (a large number), .label (a small caption), .muted, .pill.',
  '- Controls: <button> is the accent button; button.secondary and button.ghost are quieter. .segmented holds a few buttons as one choice; mark the chosen one aria-pressed="true". .field is a label above its input. Inputs, selects, ranges, checkboxes and tables are already styled.',
  '- Calculators: .display (with .expression and .result inside) and .keypad (a 4-column grid of soft keys; .accent for operators and equals, .muted for clear and brackets, .wide for a key two columns across).',
  '',
  'EVERY SIZE: the widget can be resized from about 220px to the full page width. <html data-size> is "compact" (under 280px wide), "regular" or "large" (520px and up), and data-orientation is "landscape", "square" or "portrait" when the student fixes the height.',
  '- Always design a compact version: show only the essentials (the result and the main controls) with .hide-compact, .only-compact or [data-size="compact"] styles. Use .only-large or [data-size="large"] to show more when there is room (history, a second column, a bigger chart).',
  '- Never use fixed pixel widths; let things wrap. A canvas must size itself to its container (and devicePixelRatio) and redraw on kit.on_size and window resize.',
  '',
  'QUALITY BAR:',
  '- Do everything the brief asks, completely. No placeholders, no "coming soon", no lorem ipsum; use the real facts, formulas and data from the brief.',
  '- Useful at once: sensible starting values so it shows a real result before any input.',
  '- Never show NaN, undefined, Infinity or a raw error: check input and show a short, friendly message.',
  '- Keyboard: every control works by keyboard; calculators also take typed digits and operators, Enter for equals, Backspace and Escape.',
  '- Remember what the student would expect (settings, history, scores, progress) with kit.save.',
  '- Accessible: real <button type="button">s with clear names (aria-label for symbol keys like ÷), a <label> for every input, results in an element with aria-live="polite", never colour alone.',
  '- Calm, native-looking design: no title or heading repeating the widget\'s name (the window shows it), no emoji decorations, the accent only for the main action.',
  '- Keep the code tidy and short enough to read; under 40,000 characters.',
  '',
  'EXAMPLE, a calculator:',
  CALCULATOR_APP,
  '',
  'EXAMPLE, a unit converter:',
  CONVERTER_APP,
].join('\n');

// The checks an app is turned down for, repeated last in the request, where the builder is
// most likely to heed them; each one missed costs a whole new attempt.
export const APP_FINAL_CHECKS = [
  'Before you answer, check:',
  '1. The html has a compact version: elements with class hide-compact or only-compact, or [data-size="compact"] styles.',
  '2. No eval(), new Function(), storage, network, alert(), confirm() or prompt(); maths goes through kit.calc, saving through kit.save.',
  '3. Everything in the brief works, from the keyboard too.',
].join('\n');

// request: { title, brief, current_html?, problem?, previous_html? }. current_html is the app
// being changed; problem (with previous_html) is what was wrong with the last attempt.
export function build_widget_app_request({ title, brief, current_html, problem, previous_html }) {
  const parts = [`App title: ${title}`, `What it must do: ${brief}`];
  if (current_html) parts.push(`This is the app now. Keep everything that works and change only what the brief asks:\n${current_html}`);
  if (problem) parts.push(`Your last version was turned down: ${problem}\nFix that and return the whole app again.${previous_html ? `\nThe last version:\n${previous_html}` : ''}`);
  parts.push(APP_FINAL_CHECKS);
  return {
    system_prompt: APP_BUILDER_GUIDE,
    user_prompt: parts.join('\n\n'),
    json_schema: WIDGET_APP_JSON_SCHEMA,
    task_tier: AI_TASK_TIER.build,
  };
}

// The builder's answer, tidied: { html, height, summary }, or null when there's no html.
// The height falls back to the default; clean_widget_spec checks the rest.
export function normalize_widget_app(ai_output) {
  const html = typeof ai_output?.html === 'string' ? ai_output.html.trim() : '';
  if (html === '') return null;
  return {
    html,
    height: Number.isFinite(ai_output.height) ? Math.round(ai_output.height) : WIDGET_HEIGHT.default,
    summary: typeof ai_output.summary === 'string' ? ai_output.summary.trim() : '',
  };
}
