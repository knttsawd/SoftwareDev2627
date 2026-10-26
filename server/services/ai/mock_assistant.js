import { MS_PER_DAY, UPCOMING_DAYS } from '../../config/constants.js';
import { rank_sentences } from './mock_ai_provider.js';

// Practice mode's assistant. It understands a few simple requests by matching words, so the
// panel works without an API key:
//   "open the schedule"            open a page
//   "create a skill called Chemistry"
//   "add a topic called Enzymes"   to the skill on the page (or one named in the message)
//   "quiz me on Enzymes"           "make notes on Enzymes"
//   "make a checklist: a, b, c"    a checklist widget
//   "how am I doing?"              progress;  "what's on my schedule?"  the next week
// Anything else searches the skill's resources and quotes the best sentences.

const QUOTED_SENTENCE_COUNT = 3;
export const MOCK_ASSISTANT_NOTICE = '> Practice mode understands simple requests only. Set AI_PROVIDER in server/.env for the full assistant.';

// Words that name each page, checked in order.
export const PAGE_WORDS = [
  ['skill map', '/dashboard/skill-map'],
  ['learn', '/dashboard/learn'],
  ['teach', '/dashboard/teach'],
  ['quiz', '/dashboard/quiz'],
  ['work block', '/dashboard/work-block'],
  ['timer', '/dashboard/work-block'],
  ['schedule', '/dashboard/schedule'],
  ['calendar', '/dashboard/schedule'],
  ['progress', '/dashboard/progress'],
  ['settings', '/dashboard/settings'],
];

// The page named in text, or null.
export function find_page_path(text) {
  const lowercase_text = text.toLowerCase();
  return PAGE_WORDS.find(([page_word]) => lowercase_text.includes(page_word))?.[1] ?? null;
}

// The skill the message is about: one named in it, the one on the current page, or the first.
export function pick_message_skill(message, skills, current_skill_id) {
  const lowercase_message = message.toLowerCase();
  return (
    skills.find((skill) => lowercase_message.includes(skill.name.toLowerCase())) ??
    skills.find((skill) => skill.id === current_skill_id) ??
    skills[0] ??
    null
  );
}

// Text after a pattern's match, without surrounding quotes and end punctuation.
export function clean_match(text) {
  return text.trim().replace(/^["“']|["”'.!?]+$/g, '').trim();
}

// The items of "make a checklist: read chapter 2, do the quiz and revise".
export function split_list_items(text) {
  return text
    .split(/,|\band\b/)
    .map(clean_match)
    .filter(Boolean);
}

// Seconds in a minute and an hour, for timers asked for in words.
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

// Each request the mock understands: a pattern and the tool call it makes (or null).
const REQUEST_RULES = [
  {
    pattern: /\b(?:open|go to|take me to|show me)\b(.*)/i,
    make_call: (match) => {
      const path = find_page_path(match[1]);
      return path ? { tool: 'open_page', arguments: { path } } : null;
    },
  },
  {
    pattern: /\b(?:create|add|make|start)\s+(?:a\s+)?(?:new\s+)?skill\s+(?:called\s+|named\s+|for\s+)?(.+)/i,
    make_call: (match) => ({ tool: 'create_skill', arguments: { name: clean_match(match[1]) } }),
  },
  {
    pattern: /\badd\s+(?:a\s+|the\s+)?topic\s+(?:called\s+|named\s+)?(.+?)(?:\s+(?:to|in)\s+[^,]+)?$/i,
    make_call: (match, skill) => (skill ? { tool: 'add_topic', arguments: { skill_id: skill.id, topic: clean_match(match[1]) } } : null),
  },
  {
    pattern: /\b(?:quiz me|test me|make (?:me )?a quiz)\b(?:\s+(?:on|about))?\s*(.*)/i,
    make_call: (match, skill) => {
      if (!skill) return null;
      const topic = clean_match(match[1]);
      return { tool: 'make_quiz', arguments: topic ? { skill_id: skill.id, topic } : { skill_id: skill.id, scope: 'skill' } };
    },
  },
  {
    pattern: /\b(?:make|write|create)\s+(?:me\s+)?(?:some\s+)?notes\s+(?:on|about)\s+(.+)/i,
    make_call: (match, skill) => (skill ? { tool: 'make_notes', arguments: { skill_id: skill.id, topic: clean_match(match[1]) } } : null),
  },
  {
    pattern: /\b(\d+)[\s-]*(second|sec|minute|min|hour|hr)s?\b.*\b(?:timer|countdown)\b|\b(?:timer|countdown)\b.*?\b(\d+)[\s-]*(second|sec|minute|min|hour|hr)s?\b/i,
    make_call: (match) => {
      const amount = Number(match[1] ?? match[3]);
      const unit = (match[2] ?? match[4]).toLowerCase();
      const seconds = amount * (unit.startsWith('h') ? SECONDS_PER_HOUR : unit.startsWith('m') ? SECONDS_PER_MINUTE : 1);
      const length = `${amount} ${unit.startsWith('h') ? 'hour' : unit.startsWith('m') ? 'minute' : 'second'}${amount === 1 ? '' : 's'}`;
      return {
        tool: 'create_widget',
        arguments: { title: `${length} timer`, kind: 'card', blocks: [{ type: 'timer', label: length, seconds }], width: 'small' },
      };
    },
  },
  {
    pattern: /\b(?:make|build|create|give|add)\b.*\b(calculator|converter)\b/i,
    make_call: (match) => ({
      tool: 'create_widget',
      arguments: { title: /calculator/i.test(match[1]) ? 'Calculator' : 'Unit converter', kind: 'app', brief: match[0], width: 'medium' },
    }),
  },
  {
    pattern: /\b(?:checklist|to-?do list)\b[^:]*:\s*(.+)/i,
    make_call: (match) => ({
      tool: 'create_widget',
      arguments: { title: 'Checklist', kind: 'card', blocks: [{ type: 'checklist', items: split_list_items(match[1]) }] },
    }),
  },
  {
    pattern: /\b(?:my progress|how am i doing)\b/i,
    make_call: () => ({ tool: 'get_progress', arguments: {} }),
  },
  {
    pattern: /\b(?:my schedule|my calendar|this week|upcoming)\b/i,
    make_call: (match, skill, now) => ({
      tool: 'list_events',
      arguments: { from: now.toISOString(), to: new Date(now.getTime() + UPCOMING_DAYS * MS_PER_DAY).toISOString() },
    }),
  },
];

// The tool calls for a new message: the first rule that matches, or a resource search.
export function plan_mock_tool_calls({ message, skills, current_skill_id, now }) {
  const skill = pick_message_skill(message, skills, current_skill_id);
  for (const { pattern, make_call } of REQUEST_RULES) {
    const match = message.match(pattern);
    const tool_call = match && make_call(match, skill, now);
    if (tool_call) return [tool_call];
  }
  return skill ? [{ tool: 'search_resources', arguments: { skill_id: skill.id, query: message } }] : [];
}

// A tool result as an object, or null when it was cut short and can't be read.
export function read_result(result_text) {
  try {
    return JSON.parse(result_text);
  } catch {
    return null;
  }
}

// The answer to a question: the resource sentences that best match it.
export function quote_resources(message, excerpts) {
  const matching_sentences = rank_sentences(excerpts, message)
    .filter((ranked_sentence) => ranked_sentence.score > 0)
    .slice(0, QUOTED_SENTENCE_COUNT)
    .map(({ sentence }) => `- ${sentence}`);
  if (matching_sentences.length === 0) return "I couldn't find anything about that in your resources.";
  return `Here's what your resources say:\n\n${matching_sentences.join('\n')}`;
}

// The reply once the tools have run: each outcome in words with its link, or the quotes.
export function write_mock_reply({ message, step_results }) {
  const lines = step_results.map((step_result) => {
    const result = read_result(step_result.result);
    if (!result) return `Done: ${step_result.tool}.`;
    if (!result.ok) return `I couldn't do that: ${result.error}`;
    if (step_result.tool === 'search_resources') return quote_resources(message, result.data?.excerpts ?? '');
    if (result.status === 'waiting_for_confirmation') return 'Please confirm in the panel to go ahead.';
    return result.link ? `${result.summary} [Open it](${result.link})` : result.summary;
  });
  return [MOCK_ASSISTANT_NOTICE, ...lines].join('\n\n');
}

// One step: tools on the first step, a reply once there are results.
export function build_mock_assistant_step(step_request) {
  if (step_request.step_results.length > 0) return { reply_markdown: write_mock_reply(step_request), tool_calls: [] };
  const tool_calls = plan_mock_tool_calls(step_request);
  if (tool_calls.length > 0) return { reply_markdown: '', tool_calls };
  return { reply_markdown: `${MOCK_ASSISTANT_NOTICE}\n\nAdd a skill first, for example "create a skill called Biology".`, tool_calls: [] };
}
