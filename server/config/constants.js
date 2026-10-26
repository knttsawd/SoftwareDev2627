import path from 'node:path';

// Fixed values shared across the server. Per-environment values live in .env instead.
// Validation limits mirror the CHECK constraints in db/schema.sql; change both together.

const SERVER_ROOT = path.join(import.meta.dirname, '..');

export const DEFAULT_PORT = 4000;
export const DEFAULT_CLIENT_ORIGIN = 'http://localhost:5173';
export const DEFAULT_DATABASE_PATH = path.join(SERVER_ROOT, 'data', 'studyapp.db');
export const DEFAULT_UPLOADS_PATH = path.join(SERVER_ROOT, 'data', 'uploads');
export const IN_MEMORY_DATABASE = ':memory:';

export const API_PREFIX = '/api';
export const JSON_BODY_LIMIT = '1mb';

export const BEARER_PREFIX = 'Bearer ';

export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  no_content: 204,
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unprocessable: 422,
  server_error: 500,
  bad_gateway: 502,
  service_unavailable: 503,
};

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 50;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_SALT_BYTES = 16;
export const PASSWORD_KEY_LENGTH = 64;
export const SESSION_TOKEN_BYTES = 32;
export const SESSION_LIFETIME_DAYS = 30;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Skills
export const SKILL_NAME_MAX_LENGTH = 80;
export const DEFAULT_SKILL_COLOR = '#4F46E5';
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// Resources. 25 MB is the Whisper API's upload limit, so it is the limit for every upload.
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const RESOURCE_TITLE_MAX_LENGTH = 200;
export const TYPED_NOTE_MAX_LENGTH = 100_000;
export const MIN_EXTRACTED_CHARACTERS = 20;
// Roughly a 500-page book. Longer text is cut here, and the response says so.
export const MAX_EXTRACTED_CHARACTERS = 1_000_000;
export const URL_MAX_LENGTH = 2048;

// Fetching articles and video details from the web
export const ARTICLE_FETCH_TIMEOUT_MS = 15_000;
export const ARTICLE_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const FETCH_USER_AGENT = 'StudyApp/1.0 (study resource import)';
export const YOUTUBE_OEMBED_URL = 'https://www.youtube.com/oembed';
export const PREFERRED_CAPTION_LANGUAGE = 'en';

// Topics on the skill map, and how well the student knows each one.
// A topic's mastery is the average of the student's last MASTERY_RECENT_RESULTS quiz scores
// on it. Levels: strong at 80%+, developing at 50-79%, weak below 50%, untested with no quiz.
export const MASTERY_THRESHOLDS = { strong: 80, developing: 50 };
export const MASTERY_RECENT_RESULTS = 3;
export const MAX_STUDY_SUGGESTIONS = 3;
export const MAX_GENERATED_TOPICS = 10;
export const MAX_GENERATED_SUBTOPICS = 6;
export const MAX_TOPICS_PER_SKILL = 80;
// Topics nest like folders: a main topic is level 1, its subtopics level 2, and so on.
export const MAX_TOPIC_DEPTH = 6;
// Between topic names in a topic's place on the map, e.g. "Maritime empires > Maritime technologies".
export const TOPIC_PATH_SEPARATOR = ' > ';
export const TOPIC_SUMMARY_MAX_LENGTH = 300;
export const RECENT_RESULTS_LIMIT = 20;

// Schedule events. Limits mirror db/schema.sql.
export const EVENT_TITLE_MAX_LENGTH = 120;
export const EVENT_DETAILS_MAX_LENGTH = 2000;
export const MAX_EVENT_MINUTES = 24 * 60;
// The longest date range one calendar request may ask for (a month view plus spare days).
export const MAX_EVENT_RANGE_DAYS = 62;
export const MS_PER_MINUTE = 60 * 1000;

// Work blocks (focus timer sessions).
export const WORK_BLOCK_ACTIVITIES = ['quiz', 'assignment'];
export const WORK_BLOCK_MINUTES = { min: 5, max: 120 };
// A student's own break length (users.break_minutes). Mirrors db/schema.sql.
export const BREAK_MINUTES = { min: 1, max: 60 };

// AI notes and quizzes
export const TOPIC_MAX_LENGTH = 120;
export const QUIZ_QUESTION_COUNT = { min: 3, max: 15, default: 5 };
export const QUIZ_CHOICE_COUNT = 4;
// What a quiz covers: the whole skill, one topic (a map topic or a typed one), or one resource.
export const QUIZ_SCOPES = ['skill', 'topic', 'resource'];
export const SOURCE_CHUNK_CHARACTERS = 1500;
export const MAX_SOURCE_CHARACTERS = 24_000;

// The assistant: the AI helper on every page that can act in the app by calling tools.
// Each turn sees the last ASSISTANT_CONTEXT_MESSAGES messages and runs at most
// ASSISTANT_MAX_STEPS rounds of tool calls (ASSISTANT_MAX_TOOL_CALLS each), so one request
// can't run away with the AI quota. Tool results are cut to ASSISTANT_TOOL_RESULT_CHARACTERS.
export const ASSISTANT_MESSAGE_MAX_LENGTH = 4000;
export const ASSISTANT_CONTEXT_MESSAGES = 12;
export const ASSISTANT_HISTORY_LIMIT = 200;
export const ASSISTANT_MAX_STEPS = 5;
export const ASSISTANT_MAX_TOOL_CALLS = 6;
export const ASSISTANT_TOOL_RESULT_CHARACTERS = 4000;
export const ASSISTANT_SOURCE_CHARACTERS = 8000;
// The page the student is on, as sent by the client ("/dashboard/learn?skill=..."), is cut to this.
export const ASSISTANT_PAGE_MAX_LENGTH = 300;
// Time zones run from UTC-12:00 to UTC+14:00, so an offset is never more than 14 hours.
export const MINUTES_PER_UTC_OFFSET_LIMIT = 14 * 60;
// How far ahead "upcoming" looks, for events in the assistant's overview and widgets.
export const UPCOMING_DAYS = 7;
export const MAX_UPCOMING_EVENTS = 8;

// Widgets the assistant makes. A "card" is built from safe blocks (WIDGET_BLOCK_TYPES); an
// "app" is a small HTML page the AI writes, run in a sandbox with no network access.
export const WIDGET_KINDS = ['card', 'app'];
export const WIDGET_BLOCK_TYPES = ['markdown', 'checklist', 'countdown', 'timer', 'flashcards', 'links', 'live'];
// A timer block runs for 1 second to 24 hours.
export const WIDGET_TIMER_SECONDS = { min: 1, max: 86_400 };
// Live blocks show the student's own data, worked out each time the widget is shown.
export const WIDGET_LIVE_SOURCES = ['weak_topics', 'upcoming_events', 'progress_summary', 'learning_path_next', 'recent_results'];
export const MAX_WIDGETS = 50;
export const WIDGET_TITLE_MAX_LENGTH = 80;
export const WIDGET_MAX_BLOCKS = 12;
export const WIDGET_TEXT_MAX_LENGTH = 4000;
export const WIDGET_ITEM_MAX_LENGTH = 300;
export const WIDGET_MAX_ITEMS = 50;
export const WIDGET_HTML_MAX_LENGTH = 60_000;
export const WIDGET_HEIGHT = { min: 120, max: 900, default: 360 };
// The app builder gets this many tries to write an app that passes the checks
// (clean_widget_spec); each retry is told what was wrong.
export const APP_BUILD_ATTEMPTS = 2;
export const WIDGET_STATE_MAX_LENGTH = 10_000;
// Where a widget (or stack) shows, its pinned_paths: every dashboard page (["*"]), a list
// of pages by their paths (up to MAX_PINNED_PAGES), or none ([], only in the Widgets tab).
export const WIDGET_PIN_EVERYWHERE = '*';
export const MAX_PINNED_PAGES = 12;
// How a widget (or a stack of them) sits on the page it's pinned to (its layout):
//   docked     width in the page's columns, a content height in pixels (null fits the
//              content), and its place in the order (null puts it first, newest first)
//   floating   a window above the page at x, y with float_width by float_height pixels
//              (null until first placed), anchored to the "page" (scrolls with it) or the
//              "screen" (stays put)
//   any mode   folded away or not; hidden or not (a hidden widget shows on no page, only in
//              the Widgets tab, until it's shown again); its content size: "auto" fits the
//              content to the widget's size, or a fixed compact, regular or large layout;
//              and its look (below)
// The look: solid, glass or tinted, with an accent; its corners and shadow; how strongly a
// tinted widget is tinted; and for glass, its tint (the neutral surface colour or the
// accent), how opaque that tint is, how frosted (blur, in pixels), how much its edges bend
// what's behind, and its colour boost (100 keeps the page's own colours).
export const WIDGET_WIDTHS = ['small', 'medium', 'large', 'full'];
export const WIDGET_MODES = ['docked', 'floating'];
export const WIDGET_ANCHORS = ['page', 'screen'];
export const WIDGET_APPEARANCES = ['solid', 'glass', 'tinted'];
export const WIDGET_ACCENTS = ['indigo', 'teal', 'sky', 'green', 'amber', 'rose', 'slate'];
export const WIDGET_CONTENT_SIZES = ['auto', 'compact', 'regular', 'large'];
export const WIDGET_CORNERS = ['subtle', 'round', 'extra'];
export const WIDGET_SHADOWS = ['none', 'soft', 'deep'];
export const WIDGET_GLASS_TINTS = ['neutral', 'accent'];
// Look settings that are whole numbers, kept within these limits.
export const WIDGET_LOOK_NUMBERS = {
  tint_strength: { min: 0, max: 40 },
  glass_opacity: { min: 0, max: 90 },
  glass_frost: { min: 0, max: 24 },
  glass_bend: { min: 0, max: 100 },
  glass_vibrance: { min: 100, max: 200 },
};
export const DEFAULT_WIDGET_LAYOUT = {
  width: 'small',
  height: null,
  is_collapsed: false,
  position: null,
  mode: 'docked',
  anchor: 'screen',
  x: null,
  y: null,
  float_width: null,
  float_height: null,
  appearance: 'solid',
  accent: 'indigo',
  content_size: 'auto',
  is_hidden: false,
  corners: 'round',
  shadow: 'soft',
  tint_strength: 10,
  glass_tint: 'neutral',
  glass_opacity: 25,
  glass_frost: 8,
  glass_bend: 50,
  glass_vibrance: 100,
};
export const WIDGET_CONTENT_HEIGHT = { min: 80, max: 1200 };
export const WIDGET_FLOAT_WIDTH = { min: 220, max: 1600 };
export const WIDGET_FLOAT_HEIGHT = { min: 120, max: 1600 };
export const WIDGET_FLOAT_OFFSET = { min: -20_000, max: 20_000 };
// Smart stacks: several widgets shown in one place, one at a time ("swipe" between them, or
// pick one from a "list"). A stack holds 2 to MAX_STACK_WIDGETS widgets.
export const WIDGET_STACK_VIEWS = ['swipe', 'list'];
export const MAX_STACK_WIDGETS = 10;
export const MAX_WIDGET_STACKS = 20;
export const DASHBOARD_PATH_PATTERN = /^\/dashboard\/[a-z-]+$/;
export const MAX_LIVE_ITEMS = 5;

// Teach the AI student. The student explains a topic to an AI student that knows only what
// it is taught; then both take the same quiz. The combined grade weighs the two scores.
export const AI_STUDENT_NAME = 'Pip';
export const TEACH_MESSAGE_MAX_LENGTH = 4000;
// The most explanations one lesson takes, which also caps how much each AI call costs.
export const MAX_TEACH_MESSAGES = 15;
export const TEACH_QUIZ_QUESTION_COUNT = { min: 3, max: 10, default: 5 };
export const TEACH_SCORE_WEIGHTS = { student: 0.5, ai_student: 0.5 };
export const AI_STUDENT_REASON_MAX_LENGTH = 300;
export const RECENT_TEACH_SESSIONS_LIMIT = 20;

// AI providers. "mock" needs no API key; see services/ai/.
export const AI_PROVIDER_NAMES = ['mock', 'gemini', 'anthropic', 'openai'];
export const TRANSCRIPTION_PROVIDER_NAMES = ['mock', 'gemini', 'openai'];
export const DEFAULT_AI_PROVIDER = 'mock';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
export const WHISPER_MODEL = 'whisper-1';
export const AI_MAX_OUTPUT_TOKENS = 16_000;

// How demanding each AI task is. Providers with several models (Gemini) use the tier to
// pick the cheapest model that does the job well; others use their one model for everything.
//   light     summarizing or rewriting the student's own text (study notes)
//   standard  tasks that need judgement (quiz questions with believable wrong answers)
//   build     writing code that must work first time (app widgets), with more thinking
export const AI_TASK_TIER = { light: 'light', standard: 'standard', build: 'build' };

// Gemini models, chosen to keep within free and low-cost limits: Flash-Lite for light
// work and transcription, Flash only where judgement matters. The first model in each list
// is used; the next ones are tried only when the one before is busy, out of quota, or (for
// transcription) returns nothing. The first entry of each list can be changed in .env.
// Flash-Lite transcribes recordings accurately; the dedicated gemini-3.5-transcribe model
// has a very small free quota, so it is only used if set as GEMINI_TRANSCRIPTION_MODEL.
export const DEFAULT_GEMINI_MODELS = {
  light: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  standard: ['gemini-3.5-flash', 'gemini-3.5-flash-lite'],
  build: ['gemini-3.5-flash', 'gemini-3.5-flash-lite'],
  transcription: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
};
// Gemini thinks before answering; less thinking means fewer tokens used.
export const GEMINI_THINKING_LEVEL = { light: 'MINIMAL', standard: 'LOW', build: 'MEDIUM' };
// Requests to Gemini are capped at 20 MB, so larger recordings go through its file upload.
export const GEMINI_INLINE_MEDIA_MAX_BYTES = 18 * 1024 * 1024;
export const GEMINI_FILE_READY_TIMEOUT_MS = 120_000;
export const GEMINI_FILE_POLL_INTERVAL_MS = 2000;

// Progress tracking: progress bars and improvement metrics only, with no streaks, badges
// or levels. Each metric compares a recent period with the one just before it.
export const QUIZ_SCORE_PERIOD_DAYS = 30;
export const STUDY_TIME_PERIOD_DAYS = 7;
// The Progress page draws one bar per day for this many days of focus time.
export const STUDY_TIME_CHART_DAYS = 14;
export const MAX_TOPIC_CHANGES = 5;

// Learning features: guided lessons, the learning path, practice with hints, active reading,
// "explain another way" and the key terms glossary.
// A guided lesson teaches one topic in short steps, each ending in a check question. A
// missed check can be explained again (with a new question) up to MAX_LESSON_RETEACHES times.
export const LESSON_STEP_COUNT = { min: 3, max: 6, default: 4 };
export const MAX_LESSON_RETEACHES = 2;
export const RECENT_LEARNING_ITEMS_LIMIT = 20;
// Practice: a worked example, then problems with hints revealed one at a time.
export const PRACTICE_PROBLEM_COUNT = { min: 1, max: 5, default: 3 };
export const MAX_PRACTICE_HINTS = 3;
export const PRACTICE_ANSWER_MAX_LENGTH = 2000;
// Active reading splits a resource into sections of about this many characters.
export const READING_SECTION_CHARACTERS = 2500;
// A line this short with no full stop at the end starts a new section as its heading.
export const READING_HEADING_MAX_LENGTH = 80;
export const READING_PASSAGE_MAX_LENGTH = 2000;
// "Explain another way": the ways an explanation can be rewritten. "plain" explains a
// passage the student picked while reading.
export const EXPLAIN_STYLES = ['simpler', 'analogy', 'example', 'deeper', 'plain'];
export const EXPLAIN_TEXT_MAX_LENGTH = 6000;
export const EXPLAIN_SOURCE_CHARACTERS = 6000;
// Key terms
export const GLOSSARY_TERM_MAX_LENGTH = 80;
export const GLOSSARY_DEFINITION_MAX_LENGTH = 600;
export const MAX_GENERATED_GLOSSARY_TERMS = 12;
export const MAX_GLOSSARY_TERMS_PER_SKILL = 300;
