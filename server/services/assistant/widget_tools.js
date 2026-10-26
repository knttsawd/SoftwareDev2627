import {
  APP_BUILD_ATTEMPTS,
  DASHBOARD_PATH_PATTERN,
  DEFAULT_WIDGET_LAYOUT,
  HTTP_STATUS,
  WIDGET_ACCENTS,
  WIDGET_ANCHORS,
  WIDGET_APPEARANCES,
  WIDGET_BLOCK_TYPES,
  WIDGET_CONTENT_SIZES,
  WIDGET_CORNERS,
  WIDGET_GLASS_TINTS,
  WIDGET_LOOK_NUMBERS,
  WIDGET_LIVE_SOURCES,
  WIDGET_MODES,
  WIDGET_PIN_EVERYWHERE,
  WIDGET_SHADOWS,
  WIDGET_STACK_VIEWS,
  WIDGET_WIDTHS,
} from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { create_widget, delete_widget, get_owned_widget, list_widgets, update_widget } from '../widget_service.js';
import { clean_widget_spec, validate_new_stack, validate_new_widget, validate_widget_updates } from '../widget_specs.js';
import { create_stack, delete_stack, find_widget_stack, get_owned_stack } from '../widget_stack_service.js';
import { count_words, pick_sent, take_values } from './tool_helpers.js';

// The assistant's tools for widgets: cards made of safe blocks, and small sandboxed apps
// (see widget_specs.js for what each may contain). The assistant describes an app in a
// brief; the app builder (build_widget_app on the AI provider, widget_app_prompts.js)
// writes and fixes its code.

// How to make a good widget, for the tools that make and change them. Widgets show in
// small windows the student can resize, so everything must look finished at every size.
export const WIDGET_GUIDE = [
  'GOOD WIDGETS: one clear purpose, glanceable in two seconds, with a short title (2 to 4 words, no "widget"). Put only what helps right now.',
  'WHICH KIND FITS (use the first that matches):',
  '- a length of time ("a 30 minute countdown", "timer for 10 minutes", "pomodoro", "time my essay for an hour") -> card with a timer block, seconds = the length in seconds. The student presses Start.',
  '- counting down to a moment (an exam, a deadline, "Friday at 5") -> card with a countdown block, target = that date-time.',
  '- things to do -> checklist; questions to learn -> flashcards from their resources; their weak topics, next steps, progress or results -> live; shortcuts -> links; formulas, tips or notes -> markdown.',
  '- anything interactive the blocks cannot do (calculators, converters, solvers, games, simulations, graphs) -> app.',
  'EXAMPLES: "make me a 30 minute countdown" -> create_widget {"title": "30 minute timer", "kind": "card", "blocks": [{"type": "timer", "label": "Focus", "seconds": 1800}], "width": "small"}.',
  '"countdown to my chemistry exam" (on the 14th at 9:00, offset +01:00) -> {"title": "Chemistry exam", "kind": "card", "blocks": [{"type": "countdown", "label": "Chemistry exam", "target": "2026-11-14T09:00:00+01:00"}]}.',
  '"a to-do list for my essay" -> a checklist of 4 to 6 concrete steps for that essay, not generic advice.',
  'CARD: blocks is a list of { type, title? } (give a block a title only when the card has several blocks), one of:',
  'timer { label, seconds: 1 to 86400 } | countdown { label, target: ISO date-time with the student\'s UTC offset } | checklist { items: short actions, at most 8 }',
  '| flashcards { cards: [{ front: a question, back: a short answer }], 5 to 15 cards } | links { links: [{ label, path: "/dashboard/..." }], at most 6 }',
  `| live { source: ${WIDGET_LIVE_SOURCES.join(' | ')}, skill_id? } (the student's own data, always current) | markdown { markdown: a few short lines or bullets }.`,
  'Cards lay themselves out for every size automatically.',
  'APP: you write a brief, not code; an app builder writes and checks the code. Apps can be advanced: scientific and graphing calculators, unit converters,',
  'formula solvers (e.g. kinematics, molar mass, compound interest), timers, flashcard or quiz games with scores, simulations and graphs drawn on a canvas, and they remember settings, history and scores.',
  'They can do safe maths on any expression, convert units in 13 categories (length, mass, time, temperature, volume, area, speed, data, energy, pressure, force, power, angle) and lay themselves out for every size. No network or outside data.',
  'The brief must say exactly what to build: every input, button and output; how it behaves (e.g. "scientific calculator: + − × ÷ ^ √ sin cos tan log ln π and brackets, a degrees/radians switch, keyboard input, the last 5 answers");',
  'every fact it needs written out in full (formulas, constants, word lists, questions and answers from the student\'s course); what it should remember; and what matters most when the widget is small.',
  `PLACING: pin_to "${WIDGET_PIN_EVERYWHERE}" (every page), a page like "/dashboard/learn", a list of pages, or null (only in the Widgets tab). Leave pin_to out unless the student says where: a new widget then shows on the page they are on. Use "${WIDGET_PIN_EVERYWHERE}" only when they ask for every page.`,
  `width: ${WIDGET_WIDTHS.join(', ')} (a third, half, two thirds or all of the page); small suits one number or a short list, medium or wider suits apps and longer cards.`,
  `mode: ${WIDGET_MODES.join(' or ')} (a window above the page; stays: "screen" keeps it in view while scrolling, "page" scrolls with the page).`,
  `appearance: ${WIDGET_APPEARANCES.join(', ')} (solid is the default; glass is clear frosted glass and suits floating windows over the page), with an accent that fits the subject: ${WIDGET_ACCENTS.join(', ')}.`,
  `Glass starts at glass_opacity ${DEFAULT_WIDGET_LAYOUT.glass_opacity}, glass_frost ${DEFAULT_WIDGET_LAYOUT.glass_frost}, glass_bend ${DEFAULT_WIDGET_LAYOUT.glass_bend}, glass_vibrance ${DEFAULT_WIDGET_LAYOUT.glass_vibrance}; the overview shows a glass widget's current values.`,
  `content_size: ${WIDGET_CONTENT_SIZES.join(', ')} ("auto", the default, fits the layout to the widget's size).`,
].join(' ');

// The layout settings a tool call asked for, in a widget's (or stack's) layout's terms.
export function pick_layout_changes(args) {
  const layout_changes = pick_sent(args, ['width', 'mode', 'appearance', 'accent', 'content_size', 'corners', 'shadow', ...LOOK_SETTINGS]);
  if (args.stays !== undefined) layout_changes.anchor = args.stays;
  if (args.collapsed !== undefined) layout_changes.is_collapsed = args.collapsed;
  if (args.hidden !== undefined) layout_changes.is_hidden = args.hidden;
  return layout_changes;
}

// Where a new widget shows when the AI doesn't say: the dashboard page the student is on
// (page may have a query or deeper path), or nowhere.
export function default_pinned_paths(page) {
  const page_path = typeof page === 'string' ? page.split('?')[0].split('/').slice(0, 3).join('/') : '';
  return DASHBOARD_PATH_PATTERN.test(page_path) ? [page_path] : [];
}

// pin_to as a widget's pinned_paths: "*" or a page path, a list of them, or null for none.
export function to_pinned_paths(pin_to) {
  if (pin_to === undefined || pin_to === null) return [];
  return Array.isArray(pin_to) ? pin_to : [pin_to];
}

// The look settings that are numbers, and glass_tint, which the tools pass straight through.
const LOOK_SETTINGS = ['glass_tint', ...Object.keys(WIDGET_LOOK_NUMBERS)];
const describe_limits = (setting) => `${WIDGET_LOOK_NUMBERS[setting].min} to ${WIDGET_LOOK_NUMBERS[setting].max}`;

// The layout parameters shared by the tools that place widgets and stacks.
const LAYOUT_PARAMETERS = {
  width: `string, optional: ${WIDGET_WIDTHS.join(', ')}`,
  mode: `string, optional: ${WIDGET_MODES.join(' or ')}`,
  stays: `string, optional, for floating: ${WIDGET_ANCHORS.join(' or ')}`,
  appearance: `string, optional: ${WIDGET_APPEARANCES.join(', ')}`,
  accent: `string, optional: ${WIDGET_ACCENTS.join(', ')}`,
  content_size: `string, optional: ${WIDGET_CONTENT_SIZES.join(', ')}`,
  corners: `string, optional: ${WIDGET_CORNERS.join(', ')}`,
  shadow: `string, optional: ${WIDGET_SHADOWS.join(', ')}`,
  tint_strength: `integer, optional, for tinted: ${describe_limits('tint_strength')} (% of the accent)`,
  glass_tint: `string, optional, for glass: ${WIDGET_GLASS_TINTS.join(' or ')}`,
  glass_opacity: `integer, optional, for glass: ${describe_limits('glass_opacity')} (% opaque; 0 is clear)`,
  glass_frost: `integer, optional, for glass: ${describe_limits('glass_frost')} (blur in pixels)`,
  glass_bend: `integer, optional, for glass: ${describe_limits('glass_bend')} (how much the edges bend what's behind)`,
  glass_vibrance: `integer, optional, for glass: ${describe_limits('glass_vibrance')} (colour boost; 100 keeps the page's colours)`,
  collapsed: 'boolean, optional: true folds it away to just its title',
  hidden: 'boolean, optional: true hides it from every page without deleting it (it stays in the Widgets tab); false shows it again',
};

// An app's spec ({ html, height }) from the app builder, for a new app or a change to one
// (current_html). Each version is checked like any app (clean_widget_spec); one that fails
// goes back to the builder with what was wrong, up to APP_BUILD_ATTEMPTS tries. Returns
// { spec, summary }.
export async function build_app_spec(context, { title, brief, current_html = null }) {
  if (typeof brief !== 'string' || brief.trim() === '') throw create_http_error(HTTP_STATUS.bad_request, 'Give a brief saying what the app should do');
  let problem = null;
  let previous_html = null;
  for (let attempt = 1; attempt <= APP_BUILD_ATTEMPTS; attempt += 1) {
    const app = await context.ai_provider.build_widget_app({ title, brief: brief.trim(), current_html, problem, previous_html });
    const { error, spec } = clean_widget_spec('app', app);
    if (!error) return { spec, summary: app.summary };
    problem = error;
    previous_html = app.html;
  }
  throw create_http_error(HTTP_STATUS.bad_gateway, `The app builder couldn't make a working app (${problem}). Try describing it differently.`);
}

// '"Exam countdown"' for labels, falling back to the id.
function name_widget(context, widget_id) {
  try {
    return `"${get_owned_widget(context.database, context.user_id, widget_id).title}"`;
  } catch {
    return String(widget_id);
  }
}

export const WIDGET_TOOLS = [
  {
    name: 'list_widgets',
    description: "The student's widgets, with where each is pinned.",
    parameters: {},
    effect: 'read',
    label: () => 'Look at your widgets',
    run: (context) => {
      const widgets = list_widgets(context.database, context.user_id).map(({ id, title, kind, pinned_paths, spec, layout }) => ({
        id,
        title,
        kind,
        pinned_paths,
        is_hidden: layout.is_hidden,
        appearance: layout.appearance,
        width: layout.width,
        mode: layout.mode,
        is_collapsed: layout.is_collapsed,
        in_stack: find_widget_stack(context.database, context.user_id, id)?.id ?? null,
        block_types: kind === 'card' ? spec.blocks.map((block) => block.type) : null,
      }));
      return { summary: count_words(widgets.length, 'widget'), data: widgets };
    },
  },
  {
    name: 'create_widget',
    description: `Make a widget or tool for the student and show it in the chat. Make one when asked, or offer one when it would clearly help (a countdown to an exam, a checklist, flashcards, a calculator). ${WIDGET_GUIDE}`,
    parameters: {
      title: 'string, required',
      kind: 'string, required: "card" or "app"',
      blocks: `array, for a card: blocks of type ${WIDGET_BLOCK_TYPES.join(', ')}`,
      brief: 'string, for an app: exactly what it must do (see APP above); the app builder writes the code',
      pin_to: 'optional: "*" (every page), a page path, a list of page paths, or null (none)',
      ...LAYOUT_PARAMETERS,
    },
    effect: 'write',
    label: (args) => `Make the widget "${args.title}"`,
    run: async (context, args) => {
      const app = args.kind === 'app' ? await build_app_spec(context, { title: args.title, brief: args.brief }) : null;
      const pinned_paths = args.pin_to === undefined ? default_pinned_paths(context.page) : to_pinned_paths(args.pin_to);
      const widget = create_widget(
        context.database,
        context.user_id,
        take_values(
          validate_new_widget({
            title: args.title,
            kind: args.kind,
            spec: app ? app.spec : { blocks: args.blocks },
            pinned_paths,
            layout: pick_layout_changes(args),
          }),
        ),
      );
      const summary = app ? `Made the app "${widget.title}": ${app.summary}` : `Made the widget "${widget.title}".`;
      return { summary, data: { widget_id: widget.id, pinned_paths: widget.pinned_paths }, widget_id: widget.id };
    },
  },
  {
    name: 'update_widget',
    description: `Change a widget: its title, its blocks (card) or what an app does (brief), where it is pinned, its width, whether it floats, its look, or fold it away (collapsed) or open it again. ${WIDGET_GUIDE}`,
    parameters: {
      widget_id: 'string, required',
      title: 'string, optional',
      blocks: 'array, optional, replaces all the blocks of a card',
      brief: 'string, optional, for an app: what to change or add; the app builder rewrites it, keeping what works',
      pin_to: 'optional: "*" (every page), a page path, a list of page paths, or null (none)',
      ...LAYOUT_PARAMETERS,
    },
    effect: 'write',
    label: (args, context) => `Change the widget ${name_widget(context, args.widget_id)}`,
    run: async (context, args) => {
      const widget = get_owned_widget(context.database, context.user_id, args.widget_id);
      const updates = pick_sent(args, ['title']);
      if (widget.kind === 'card' && args.blocks !== undefined) updates.spec = { blocks: args.blocks };
      if (widget.kind === 'app' && args.brief !== undefined) {
        updates.spec = (await build_app_spec(context, { title: args.title ?? widget.title, brief: args.brief, current_html: widget.spec.html })).spec;
      }
      if (args.pin_to !== undefined) updates.pinned_paths = to_pinned_paths(args.pin_to);
      const layout_changes = pick_layout_changes(args);
      if (Object.keys(layout_changes).length > 0) updates.layout = layout_changes;
      const updated_widget = update_widget(
        context.database,
        context.user_id,
        widget.id,
        take_values(validate_widget_updates(updates, widget.kind, widget.layout)),
      );
      return { summary: `Updated the widget "${updated_widget.title}".`, widget_id: updated_widget.id };
    },
  },
  {
    name: 'stack_widgets',
    description:
      'Put two or more widgets into one smart stack that shows one at a time: "swipe" between them, or pick from a "list". Good for tidying a page with several widgets. A widget can be in one stack.',
    parameters: {
      widget_ids: 'array of widget ids, required, in order (2 to 10)',
      view: `string, optional: ${WIDGET_STACK_VIEWS.join(' or ')}`,
      pin_to: 'optional, where the stack shows: "*", a page path, a list of page paths, or null',
      ...LAYOUT_PARAMETERS,
    },
    effect: 'write',
    label: (args) => `Stack ${count_words(args.widget_ids?.length ?? 0, 'widget')}`,
    run: (context, args) => {
      const stack = create_stack(
        context.database,
        context.user_id,
        take_values(validate_new_stack({ widget_ids: args.widget_ids, view: args.view, pinned_paths: to_pinned_paths(args.pin_to), layout: pick_layout_changes(args) })),
      );
      return { summary: `Stacked ${count_words(stack.widget_ids.length, 'widget')}.`, data: { stack_id: stack.id } };
    },
  },
  {
    name: 'unstack_widgets',
    description: 'Take a smart stack apart; its widgets show on their own again, where the stack was. Nothing is deleted.',
    parameters: { stack_id: 'string, required (the in_stack id from list_widgets)' },
    effect: 'write',
    label: () => 'Take a stack apart',
    run: (context, args) => {
      const stack = get_owned_stack(context.database, context.user_id, args.stack_id);
      delete_stack(context.database, context.user_id, stack.id);
      return { summary: `Took apart a stack of ${count_words(stack.widget_ids.length, 'widget')}.` };
    },
  },
  {
    name: 'delete_widget',
    description: 'Delete a widget. The student must confirm.',
    parameters: { widget_id: 'string, required' },
    effect: 'write',
    needs_confirmation: true,
    label: (args, context) => `Delete the widget ${name_widget(context, args.widget_id)}`,
    run: (context, args) => {
      const widget = get_owned_widget(context.database, context.user_id, args.widget_id);
      delete_widget(context.database, context.user_id, widget.id);
      return { summary: `Deleted the widget "${widget.title}".` };
    },
  },
];
