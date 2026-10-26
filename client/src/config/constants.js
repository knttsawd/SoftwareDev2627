// Fixed values shared across the client. Per-environment values come from client/.env.

export const APP_NAME = 'StudyApp';

export const DEFAULT_API_BASE_URL = 'http://localhost:4000/api';
export const API_BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_API_BASE_URL;

export const SESSION_TOKEN_STORAGE_KEY = 'studyapp_session_token';
// The last skill chosen on any page, so the next page opens on it.
export const SELECTED_SKILL_STORAGE_KEY = 'studyapp_skill_id';
// Set once the student presses "Not now" on the learning style quiz reminder.
export const QUIZ_REMINDER_DISMISSED_KEY = 'studyapp_quiz_reminder_dismissed';
// Light, dark or "system". index.html reads the same key before the page first draws.
export const THEME_STORAGE_KEY = 'studyapp_theme';

// Keeping data in step (utils/data_events.js). Saves made within DATA_CHANGE_DELAY_MS of
// each other cause one reload; coming back to the tab after RETURN_REFRESH_AFTER_MS away
// reloads what's on screen; open tabs talk to each other on SYNC_CHANNEL_NAME.
export const DATA_CHANGE_DELAY_MS = 50;
export const RETURN_REFRESH_AFTER_MS = 30_000;
export const SYNC_CHANNEL_NAME = 'studyapp-sync';

export const HTTP_NO_CONTENT = 204;
export const HTTP_UNAUTHORIZED = 401;

export const ROUTE_PATHS = {
  home: '/',
  sign_up: '/signup',
  learning_quiz: '/signup/learning-style',
  log_in: '/login',
  dashboard: '/dashboard',
};

// How long the loading screen shows when moving to another part of the site (logging in,
// opening the dashboard), and the bar across the top runs between dashboard pages. Set to
// 0 to turn both off.
export const PAGE_TRANSITION_MS = 600;

// Staggered start times for the three bouncing dots on the loading screen.
export const LOADING_DOT_DELAYS_MS = [0, 150, 300];

export const MAIN_CONTENT_ID = 'main-content';
export const SIGN_UP_STEP_COUNT = 2;

// The assistant. Same limits as the server (ASSISTANT_MESSAGE_MAX_LENGTH, WIDGET_PIN_EVERYWHERE).
export const ASSISTANT_MESSAGE_MAX_LENGTH = 4000;
// Ctrl (or Cmd) plus this key opens and closes the assistant from any dashboard page.
export const ASSISTANT_SHORTCUT_KEY = 'k';
// How long a reply can take before the chat says bigger jobs take longer.
export const ASSISTANT_LONG_WAIT_MS = 10_000;
export const WIDGET_PIN_EVERYWHERE = '*';
export const WIDGET_TITLE_MAX_LENGTH = 80;
// App widgets grow and shrink to fit their content within these heights (the server's WIDGET_HEIGHT).
export const WIDGET_HEIGHT_LIMITS = { min: 120, max: 900 };
// Pinned widgets sit in a grid of SHELF_COLUMNS on wide screens (utils/widget_layout.js).
// Below SHELF_GRID_QUERY there's one widget per row, so only heights can change. A widget
// at least WIDGET_FULL_ROW_SHARE of the shelf wide fills its row. A resize handle's arrow
// keys change the height by WIDGET_RESIZE_STEP_PX. Heights stay within WIDGET_CONTENT_HEIGHT
// (the server's limits).
export const SHELF_COLUMNS = 6;
export const SHELF_GRID_QUERY = '(min-width: 768px)';
export const WIDGET_FULL_ROW_SHARE = 0.9;
export const WIDGET_RESIZE_STEP_PX = 40;
export const WIDGET_CONTENT_HEIGHT = { min: 80, max: 1200 };
// Floating widgets (windows above the page; only from SHELF_GRID_QUERY up, phones keep them
// docked). Sizes match the server's WIDGET_FLOAT_WIDTH and WIDGET_FLOAT_HEIGHT. A new one
// opens FLOAT_DEFAULT_WIDTH_PX wide near the top right, each a little lower than the last.
// Dragged within WIDGET_SNAP_DISTANCE_PX of an edge, a window settles WIDGET_EDGE_MARGIN_PX
// from it. Its grip's arrow keys move it WIDGET_KEYBOARD_MOVE_PX at a time.
export const WIDGET_FLOAT_WIDTH = { min: 220, max: 1600 };
export const WIDGET_FLOAT_HEIGHT = { min: 120, max: 1600 };
export const FLOAT_DEFAULT_WIDTH_PX = 340;
export const FLOAT_TOP_PX = 96;
export const FLOAT_CASCADE_PX = 28;
export const WIDGET_SNAP_DISTANCE_PX = 24;
export const WIDGET_EDGE_MARGIN_PX = 16;
export const WIDGET_KEYBOARD_MOVE_PX = 24;
// How long a stack's swipe track must stay still before the widget it settled on is saved.
export const STACK_SCROLL_SETTLE_MS = 150;
// A widget's content lays itself out for its size (describe_shape in utils/widget_layout.js):
// "compact" below the regular width, "large" from the large one, "regular" between. With a
// fixed height, wider than WIDGET_LANDSCAPE_RATIO is landscape and narrower than
// WIDGET_PORTRAIT_RATIO portrait. Checklists with CHECKLIST_COLUMNS_MIN_ITEMS or more go
// to two columns when there's room; compact live blocks show LIVE_COMPACT_ITEMS.
export const WIDGET_SIZE_CLASS_WIDTHS = { regular: 280, large: 520 };
export const WIDGET_LANDSCAPE_RATIO = 1.6;
export const WIDGET_PORTRAIT_RATIO = 0.8;
export const CHECKLIST_COLUMNS_MIN_ITEMS = 4;
export const LIVE_COMPACT_ITEMS = 3;
// Glass widgets bend what's behind their edges like a lens (utils/glass.js): within
// GLASS_BEVEL_PX of the edge, by up to GLASS_MAX_BEND_PX pixels at full edge bend
// (glass_bend 100). The bend map is drawn at GLASS_MAP_RESOLUTION of the window's size and
// redrawn when its size changes by GLASS_SIZE_STEP_PX.
export const GLASS_BEVEL_PX = 22;
export const GLASS_MAX_BEND_PX = 22;
export const GLASS_MAP_RESOLUTION = 0.5;
export const GLASS_SIZE_STEP_PX = 4;

// A widget's look, as the server keeps it (see DEFAULT_WIDGET_LAYOUT there): its corners
// (radius in pixels for each choice), its shadow, a tinted widget's tint strength, and a
// glass widget's tint, opacity, frost (blur), edge bend and colour boost, each a whole number
// within WIDGET_LOOK_NUMBERS. DEFAULT_WIDGET_LOOK is what a new widget starts with, and
// what "Reset look" goes back to.
export const WIDGET_CORNER_RADII = { subtle: 14, round: 22, extra: 30 };
export const WIDGET_LOOK_NUMBERS = {
  tint_strength: { min: 0, max: 40 },
  glass_opacity: { min: 0, max: 90 },
  glass_frost: { min: 0, max: 24 },
  glass_bend: { min: 0, max: 100 },
  glass_vibrance: { min: 100, max: 200 },
};
export const DEFAULT_WIDGET_LOOK = {
  appearance: 'solid',
  accent: 'indigo',
  corners: 'round',
  shadow: 'soft',
  tint_strength: 10,
  glass_tint: 'neutral',
  glass_opacity: 25,
  glass_frost: 8,
  glass_bend: 50,
  glass_vibrance: 100,
};
// Slider changes in the Customize panel are saved once they stop for this long.
export const WIDGET_LOOK_SAVE_DELAY_MS = 400;
// An app widget's saves (kit.save) are sent to the server after it stops saving for this long.
export const APP_SAVE_DELAY_MS = 600;
// Countdown widgets redraw once a minute, or every second (CLOCK_REFRESH_MS) within a day of
// the end, when they show seconds, as running timers do.
export const COUNTDOWN_REFRESH_MS = 60_000;
export const CLOCK_REFRESH_MS = 1000;
export const MS_PER_DAY = 86_400_000;

// Voice input (the browser's Web Speech API). Used when the browser doesn't report a language.
export const DEFAULT_SPEECH_LANGUAGE = 'en-US';

// Wide screens show the skill map and a topic's details side by side; narrower ones open
// the details in a popup. Matches Tailwind's lg breakpoint.
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';

// Skill map. Topics nest up to MAX_TOPIC_DEPTH levels (the server's limit); the map starts
// by showing DEFAULT_MAP_DETAIL_LEVEL of them.
export const MAX_TOPIC_DEPTH = 6;
export const DEFAULT_MAP_DETAIL_LEVEL = 2;

// Teach the AI student. Same values as the server.
export const AI_STUDENT_NAME = 'Pip';
export const TEACH_MESSAGE_MAX_LENGTH = 4000;
export const TEACH_QUIZ_QUESTION_COUNT = { min: 3, max: 10, default: 5 };

// Settings: the focus timer's limits. Same values as the server (WORK_BLOCK_MINUTES, BREAK_MINUTES).
export const WORK_MINUTES_LIMITS = { min: 5, max: 120 };
export const BREAK_MINUTES_LIMITS = { min: 1, max: 60 };

// Progress: the periods the server compares (QUIZ_SCORE_PERIOD_DAYS, STUDY_TIME_PERIOD_DAYS)
// and how many days the focus-time chart shows (STUDY_TIME_CHART_DAYS).
export const STUDY_TIME_CHART_DAYS = 14;
export const MINUTES_PER_HOUR = 60;

// Learning: guided lessons, practice with hints, active reading, "explain another way" and
// key terms. Same values as the server.
export const LESSON_STEP_COUNT = { min: 3, max: 6, default: 4 };
export const PRACTICE_PROBLEM_COUNT = { min: 1, max: 5, default: 3 };
export const PRACTICE_ANSWER_MAX_LENGTH = 2000;
export const READING_PASSAGE_MAX_LENGTH = 2000;
export const EXPLAIN_TEXT_MAX_LENGTH = 6000;
export const GLOSSARY_TERM_MAX_LENGTH = 80;
export const GLOSSARY_DEFINITION_MAX_LENGTH = 600;
export const ASSISTANT_PANEL_ID = 'assistant-panel';
