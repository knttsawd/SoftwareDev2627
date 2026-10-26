import { HTTP_STATUS } from '../../config/constants.js';
import { update_account } from '../account_service.js';
import { validate_account_updates } from '../account_validators.js';
import { create_event, delete_event, get_owned_event, list_events, update_event } from '../event_service.js';
import { validate_event_input, validate_event_range } from '../event_validators.js';
import { create_http_error } from '../http_error.js';
import { is_dashboard_link } from '../widget_specs.js';
import { count_words, pick_sent, take_values } from './tool_helpers.js';

// The assistant's tools for the schedule, settings and moving around the app (see
// tool_helpers.js for the shape).

// The settings the assistant may change. The email and password always need the
// student's current password, so they stay in Settings.
export const ASSISTANT_SETTING_FIELDS = ['first_name', 'last_name', 'username', 'work_minutes', 'break_minutes'];

// '"Biology revision"' for labels, falling back to the id.
function name_event(context, event_id) {
  try {
    return `"${get_owned_event(context.database, context.user_id, event_id).title}"`;
  } catch {
    return String(event_id);
  }
}

export const PLANNING_TOOLS = [
  {
    name: 'list_events',
    description: 'Schedule events that overlap a date-time range (at most 62 days). Use ISO date-times with the student\'s UTC offset.',
    parameters: { from: 'string, required: ISO date-time', to: 'string, required: ISO date-time' },
    effect: 'read',
    label: () => 'Look at your schedule',
    run: (context, args) => {
      const range = validate_event_range(args);
      if (range.error) throw create_http_error(HTTP_STATUS.bad_request, range.error);
      const events = list_events(context.database, context.user_id, range.from, range.to);
      return { summary: count_words(events.length, 'event'), data: events };
    },
  },
  {
    name: 'create_event',
    description: 'Add an event to the schedule, like a study session or an exam. Times are ISO date-times with the student\'s UTC offset; at most 24 hours long.',
    parameters: {
      title: 'string, required',
      starts_at: 'string, required: ISO date-time',
      ends_at: 'string, required: ISO date-time',
      skill_id: 'string, optional: the subject',
      details: 'string, optional',
    },
    effect: 'write',
    label: (args) => `Add "${args.title}" to your schedule`,
    run: (context, args) => {
      const event = create_event(context.database, context.user_id, take_values(validate_event_input(args)));
      return { summary: `Added "${event.title}" to the schedule.`, data: event, link: '/dashboard/schedule' };
    },
  },
  {
    name: 'update_event',
    description: 'Change a schedule event: any of title, starts_at, ends_at, skill_id (null for none) and details.',
    parameters: {
      event_id: 'string, required',
      title: 'string, optional',
      starts_at: 'string, optional',
      ends_at: 'string, optional',
      skill_id: 'string or null, optional',
      details: 'string, optional',
    },
    effect: 'write',
    label: (args, context) => `Change ${name_event(context, args.event_id)} on your schedule`,
    run: (context, args) => {
      const current_event = get_owned_event(context.database, context.user_id, args.event_id);
      const updates = pick_sent(args, ['title', 'starts_at', 'ends_at', 'skill_id', 'details']);
      const values = take_values(validate_event_input(updates, { is_partial: true, current_event }));
      const event = update_event(context.database, context.user_id, current_event.id, values);
      return { summary: `Updated "${event.title}".`, data: event, link: '/dashboard/schedule' };
    },
  },
  {
    name: 'delete_event',
    description: 'Remove an event from the schedule. The student must confirm.',
    parameters: { event_id: 'string, required' },
    effect: 'write',
    needs_confirmation: true,
    label: (args, context) => `Remove ${name_event(context, args.event_id)} from your schedule`,
    run: (context, args) => {
      const event = get_owned_event(context.database, context.user_id, args.event_id);
      delete_event(context.database, context.user_id, event.id);
      return { summary: `Removed "${event.title}" from the schedule.`, link: '/dashboard/schedule' };
    },
  },
  {
    name: 'update_settings',
    description: "Change the student's name, username, or focus timer lengths (work_minutes 5-120, break_minutes 1-60). Email and password can only be changed in Settings.",
    parameters: {
      first_name: 'string, optional',
      last_name: 'string, optional',
      username: 'string, optional',
      work_minutes: 'integer, optional',
      break_minutes: 'integer, optional',
    },
    effect: 'write',
    label: () => 'Change your settings',
    run: async (context, args) => {
      const values = take_values(validate_account_updates(pick_sent(args, ASSISTANT_SETTING_FIELDS)));
      const account = await update_account(context.database, context.user_id, values);
      return { summary: `Updated ${Object.keys(values).join(', ').replaceAll('_', ' ')}.`, data: account, link: '/dashboard/settings' };
    },
  },
  {
    name: 'open_page',
    description: 'Take the student to a page in the app, like /dashboard/learn?skill=<id>&tab=practice or a link another tool returned.',
    parameters: { path: 'string, required: starts with /dashboard/' },
    effect: 'navigate',
    label: (args) => `Open ${args.path}`,
    run: (context, args) => {
      if (!is_dashboard_link(args.path)) throw create_http_error(HTTP_STATUS.bad_request, 'path must be a dashboard page, like /dashboard/learn');
      return { summary: `Opened ${args.path}.`, client_action: { type: 'navigate', path: args.path } };
    },
  },
];
