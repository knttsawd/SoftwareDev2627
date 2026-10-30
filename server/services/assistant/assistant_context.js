import { MAX_UPCOMING_EVENTS, MS_PER_DAY, MS_PER_MINUTE, UPCOMING_DAYS } from '../../config/constants.js';
import { get_account } from '../account_service.js';
import { list_events } from '../event_service.js';
import { get_learning_style } from '../learning_profile_service.js';
import { get_owned_skill, list_skills } from '../skill_service.js';
import { list_widgets } from '../widget_service.js';

// The overview the assistant sees at the start of every step: who the student is, the
// time where they are, the page they're on, their skills (with ids, so most requests need
// no lookups), the next week's events and their widgets.

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MINUTES_PER_HOUR = 60;

// What each page is for and which addresses open what, so the assistant can link and
// navigate.
export const PAGE_GUIDE = [
  '/dashboard/skill-map?skill=<id>: skills, the topic map, resources, notes and quizzes',
  '/dashboard/learn?skill=<id>&tab=path|lessons|practice|reading|terms (&topic=<id> picks a topic); ?lesson=<id>, ?practice=<id>, ?read=<resource id> open one',
  '/dashboard/teach?session=<id> or ?skill=<id>&topic=<id>: teach the AI student Pip',
  '/dashboard/quiz?quiz=<id>, or ?skill=<id>&topic=<id> / &resource=<id> to set one up',
  '/dashboard/work-block: the focus timer',
  '/dashboard/schedule: the week calendar',
  '/dashboard/progress: progress bars and comparisons',
  '/dashboard/settings: account, timer, learning style',
].join('\n');

// "+01:00" for an offset of 60 minutes.
export function format_utc_offset(utc_offset_minutes) {
  const sign = utc_offset_minutes < 0 ? '-' : '+';
  const minutes = Math.abs(utc_offset_minutes);
  const hours_text = String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(2, '0');
  return `${sign}${hours_text}:${String(minutes % MINUTES_PER_HOUR).padStart(2, '0')}`;
}

// "Saturday 2026-10-25T14:05+01:00" for now in the student's time zone.
export function format_local_time(now, utc_offset_minutes) {
  const local_time = new Date(now.getTime() + utc_offset_minutes * MS_PER_MINUTE);
  return `${WEEKDAY_NAMES[local_time.getUTCDay()]} ${local_time.toISOString().slice(0, 16)}${format_utc_offset(utc_offset_minutes)}`;
}

// The skill named in the page address (?skill=<id>), if it is the student's.
export function find_page_skill(database, user_id, page) {
  const skill_id = new URLSearchParams(page.split('?')[1] ?? '').get('skill');
  if (!skill_id) return null;
  try {
    return get_owned_skill(database, user_id, skill_id);
  } catch {
    return null;
  }
}

// "- Biology (id s1): 4 topics (1 weak, 2 untested), 2 resources"
export function describe_skill_line(skill) {
  return `- ${skill.name} (id ${skill.id}): ${skill.topic_count} topics (${skill.weak_topic_count} weak, ${skill.untested_topic_count} untested), ${skill.resource_count} resources`;
}

// "- Exam countdown (id w1, card, on /dashboard/learn and /dashboard/quiz, docked, glass:
// opacity 25, frost 8, bend 50, boost 100, hidden)". A look other than solid is described,
// so the AI can change it relative to what it is now.
export function describe_widget_line(widget) {
  const { layout } = widget;
  const pages = widget.pinned_paths.length > 0 ? `on ${widget.pinned_paths.join(' and ')}` : 'not pinned';
  const looks = {
    solid: '',
    tinted: `, tinted ${layout.tint_strength}%`,
    glass: `, glass: opacity ${layout.glass_opacity}, frost ${layout.glass_frost}, bend ${layout.glass_bend}, boost ${layout.glass_vibrance}`,
  };
  return `- ${widget.title} (id ${widget.id}, ${widget.kind}, ${pages}, ${layout.mode}${looks[layout.appearance] ?? ''}${layout.is_hidden ? ', hidden' : ''})`;
}

// The overview text, and the skills and page skill (which practice mode uses directly).
export function build_assistant_context({ database, user_id, page, utc_offset_minutes, now }) {
  const account = get_account(database, user_id);
  const skills = list_skills(database, user_id);
  const page_skill = find_page_skill(database, user_id, page);
  const events = list_events(database, user_id, now.toISOString(), new Date(now.getTime() + UPCOMING_DAYS * MS_PER_DAY).toISOString()).slice(0, MAX_UPCOMING_EVENTS);
  const widgets = list_widgets(database, user_id);

  const lines = [
    `Student: ${account.first_name} (learning style: ${get_learning_style(database, user_id) ?? 'not set'}; focus timer ${account.work_minutes} min, break ${account.break_minutes} min).`,
    `Now: ${format_local_time(now, utc_offset_minutes)}. Use this UTC offset for event times.`,
    `Current page: ${page}${page_skill ? ` (skill on this page: ${page_skill.name}, id ${page_skill.id})` : ''}.`,
    skills.length > 0 ? `Skills:\n${skills.map(describe_skill_line).join('\n')}` : 'Skills: none yet.',
    events.length > 0
      ? `Next ${UPCOMING_DAYS} days:\n${events.map((event) => `- ${event.title} (id ${event.id}): ${event.starts_at} to ${event.ends_at}${event.skill_name ? `, ${event.skill_name}` : ''}`).join('\n')}`
      : `Next ${UPCOMING_DAYS} days: no events.`,
    widgets.length > 0
      ? `Widgets:\n${widgets.map(describe_widget_line).join('\n')}`
      : 'Widgets: none yet.',
    `Pages:\n${PAGE_GUIDE}`,
  ];
  return { context_text: lines.join('\n'), skills, page_skill };
}
