# StudyApp

StudyApp helps students learn new skills from the resources they already have. Students upload notes, PDFs, videos, audio and article links; the AI turns them into study notes, quizzes and next-step suggestions; a Learn page teaches new topics through a learning path, guided lessons, practice with hints, active reading and key terms; a dashboard brings together a skill map, schedule, work blocks and a "teach the AI student" mode; and an assistant on every page can answer questions, do almost anything in the app for the student, and build widgets and small tools.

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, SQLite database, accounts and login API | **Done** |
| 2 | Homepage, sign up (2 steps), login, dashboard layout, loading screen | **Done** |
| 3 | Resource upload and scraping, AI notes and quizzes | **Done** |
| 4 | Skill map and quiz page | **Done** |
| 5 | Schedule and work blocks | **Done** |
| 6 | Chatbot, topics with their own resources, quizzes on a skill, topic or resource | **Done** |
| 7 | Teach the AI student and grading, plus nested subtopics and a redesigned skill map | **Done** |
| 8 | Settings, progress, accessibility pass, unit test coverage, deployment configs | **Done** |
| 9 | Learning features: learning path, guided lessons, practice with hints, active reading, "explain another way", key terms | **Done** |
| 10 | The assistant on every page (replacing the Chatbot page): acts in the app through tools, and makes widgets and custom tools | **Done** |
| 11 | Polish: everything stays in sync (across pages, tabs and the assistant), the AI always knows the subject, dark mode, styled confirm popups, and many small design fixes | **Done** |

---

## Quick start

You need **Node.js 22.13 or newer** (`node -v`). [.nvmrc](.nvmrc) pins 24, the version the deployment uses (`nvm use` picks it up). There are no accounts to create and no keys to fill in.

```bash
npm run install:all   # installs root, server and client packages
npm run dev           # starts the API on :4000 and the website on :5173
```

Open <http://localhost:5173>. Check the API with <http://localhost:4000/api/health>, which should show `{"status":"ok"}`.

The first time the server starts, it creates `server/data/studyapp.db` (the database) and `server/data/uploads/` (uploaded files). Both are git-ignored. **To start fresh, stop the server and delete `server/data/`.**

`.env` files are optional. Copy `server/.env.example` or `client/.env.example` to `.env` only if you want to change a default such as the port.

### Switching on real AI (optional)

Out of the box the server runs in **practice mode**:
- `AI_PROVIDER=mock`: notes and quizzes are built from sentences in your own resources, and the assistant understands simple requests. Practice mode has no general knowledge, so it needs at least one resource to work from.
- `TRANSCRIPTION_PROVIDER=mock`: audio and video are saved with a placeholder transcript.

Everything works without an API key. To use real AI, copy `server/.env.example` to `server/.env` and set:

| Goal | Settings |
| --- | --- |
| **Gemini** writes notes and quizzes (this project's choice) | `AI_PROVIDER=gemini`, `GEMINI_API_KEY=...` |
| More Gemini keys, so rate limits are hit much less often | `GEMINI_BACKUP_API_KEYS=key2,key3` (optional) |
| **Gemini** transcribes audio and video | `TRANSCRIPTION_PROVIDER=gemini` (same key) |
| Claude writes notes and quizzes | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...` (model defaults to `claude-opus-5-5`; change with `ANTHROPIC_MODEL`) |
| OpenAI writes notes and quizzes | `AI_PROVIDER=openai`, `OPENAI_API_KEY=...` (model defaults to `gpt-5-mini`; change with `OPENAI_MODEL`) |
| Whisper transcribes audio and video | `TRANSCRIPTION_PROVIDER=openai`, `OPENAI_API_KEY=...` |

**The assistant's AI.** Each student picks the AI that runs their assistant from the ones the server can run: both Gemini options when `GEMINI_API_KEY` is set, Claude when `ANTHROPIC_API_KEY` is set, ChatGPT when `OPENAI_API_KEY` is set, and practice mode always. The list is `CHAT_ASSISTANTS` in [server/config/chat_assistants.js](server/config/chat_assistants.js).

**Several Gemini keys.** With backup keys set, requests take turns between all the keys, so each key's free limit fills up more slowly. When a key is out of quota (429) or refused, the same request goes to the next key with the **same model**, before anything falls back to a weaker model. A large recording is uploaded and transcribed with one key, because an upload only works with the key that made it. Both of this project's keys were checked with a real request.

Restart the server after changing `.env`. The startup line shows which providers are active (`AI: gemini, transcription: gemini`). An unknown provider name stops the server with a message listing the valid ones.

**Which Gemini model does what.** Each task uses the cheapest model that does it well, to stay within the free and low-cost limits. The lists live in `DEFAULT_GEMINI_MODELS` in [server/config/constants.js](server/config/constants.js).

| Task | First choice | Thinking | Fallback | Why |
| --- | --- | --- | --- | --- |
| Study notes (`light`) | `gemini-3.5-flash-lite` | minimal | `gemini-3.1-flash-lite` | Summarizing the student's own text is easy work |
| Quizzes (`standard`) | `gemini-3.5-flash` | low | `gemini-3.5-flash-lite` | Believable wrong answers and correct answer keys need judgement; in testing, Flash's questions tested understanding where Flash-Lite's tested recall |
| Transcription | `gemini-3.5-flash-lite` | — | `gemini-3.1-flash-lite` | Transcribes accurately. The dedicated `gemini-3.5-transcribe` model ran out of free quota after a handful of calls, so it is only used if you set it |
| Assistant, "Gemini Flash-Lite (quick)" (`light`) | `gemini-3.5-flash-lite` | minimal | `gemini-3.1-flash-lite` | The default. In testing it chained tools correctly (made a skill, then topics under it), answered from the student's notes, set event times in the right time zone, and wrote flashcards and a working converter app, at 2 to 5 seconds a request |
| Assistant, "Gemini Flash (thorough)" (`standard`) | `gemini-3.5-flash` | low | `gemini-3.5-flash-lite` | A choice for harder requests with many steps, or bigger custom tools |
| AI student's replies in a lesson (`light`) | `gemini-3.5-flash-lite` | minimal | `gemini-3.1-flash-lite` | Short replies and one question each |
| AI student taking the quiz (`standard`) | `gemini-3.5-flash` | low | `gemini-3.5-flash-lite` | Answering only from the lesson, and saying "don't know" otherwise, takes judgement. In testing it refused to answer what the lesson hadn't covered |
| Guided lessons and re-explaining a missed step (`standard`) | `gemini-3.5-flash` | low | `gemini-3.5-flash-lite` | Teaching well and writing check questions with one right answer need judgement. A 3-step lesson takes about 20 seconds |
| Practice problems with hints (`standard`) | `gemini-3.5-flash` | low | `gemini-3.5-flash-lite` | Problems need correct answers and hints that help without giving the answer away |
| Learning path order, checking a practice answer, reading guides, "explain another way", key terms (`light`) | `gemini-3.5-flash-lite` | minimal | `gemini-3.1-flash-lite` | Short, focused tasks. In testing the path put foundations first and every key term matched the right topic |

- **Fallbacks:** the fallback model is tried only when the first choice is busy (5xx) or out of quota (429). For transcription, it's also tried when the first model rejects the file format or returns nothing.
- **Changing a model:** set `GEMINI_LIGHT_MODEL`, `GEMINI_STANDARD_MODEL`, `GEMINI_BUILD_MODEL` (the app builder) or `GEMINI_TRANSCRIPTION_MODEL` in `.env`.
- **Typical cost:** about 700 tokens for a set of notes, 650 for a 4-question quiz, and about 4,000 to 6,000 per assistant step (the tool list, an overview of the student's skills and week, and the last 12 messages); most requests take 2 or 3 steps. A recording uses about 32 audio tokens per second (a 10-minute lecture is about 11,000 tokens). Video is read at low frame resolution, since only the speech matters.

### Run the tests

```bash
npm test                  # server then client
npm test --prefix server
npm test --prefix client
npm run test:coverage     # the same, plus a coverage report for each half
```

`test:coverage` prints a table per file and writes an HTML report to `server/coverage/` and `client/coverage/` (git-ignored; open `index.html`). At the end of Phase 9, server functions were 99.7% covered and client functions 97%; what's left is mostly inline event handlers and lazy page imports, which the page tests exercise without the tool counting them.

Server tests use a real SQLite database held in memory, so every test starts empty and nothing touches `server/data/`. Client tests replace `fetch` with fakes.

### Look inside the database

`studyapp.db` is a normal SQLite file. Open it with [DB Browser for SQLite](https://sqlitebrowser.org/) (free) or the VS Code "SQLite Viewer" extension to see and edit rows while debugging.

> **OneDrive note:** this folder lives in OneDrive, which tries to sync `node_modules` and the database file. If installs are slow, files get locked, or the database reports "database is locked", pause OneDrive syncing or move the project to a folder outside OneDrive such as `C:\dev\studyapp`.

---

## How it fits together

```
Browser (React, client/)                          Express API (server/)                      server/data/
───────────────────────                           ─────────────────────                      ────────────
auth_service.sign_up / log_in ── POST /api/auth/* ──▶ auth_routes ──▶ account_service ──▶ studyapp.db
      │ ◀──────────────── { token, account } ────────────  (+ session_service makes the token)
      ▼
session_store.save_session_token   (localStorage)
      │
auth_service.send_authed_request
      │
api_client.api_request ── HTTP + "Authorization: Bearer <token>" ──▶ app.js
                                                                      │ cors, json
                                                                      ▼
                                                            require_auth ── find_session_user_id ──▶ sessions table
                                                                      │ sets req.user_id
                                                                      ▼
                                                            routes/* ──▶ services/* ──▶ studyapp.db, uploads/
                                                                      │
                                                            handle_errors (any thrown error → JSON)
```

**Key decisions**

- **SQLite through Node's built-in `node:sqlite`.** No database server and no native packages to compile. The whole database is one file.
- **Login is handled by the app itself.** Passwords are hashed with scrypt (`node:crypto`). Logging in creates a random session token; the database stores only its SHA-256 hash, the client stores the token in `localStorage`, and it sends the token on every request. Sessions last `SESSION_LIFETIME_DAYS` (30). Logging out deletes the session.
- **The schema applies itself.** `open_database` runs `db/schema.sql` on every start. Every statement is `IF NOT EXISTS`, so new tables appear automatically. Columns added to existing tables are listed in [db/migrations.js](server/db/migrations.js), which adds them to older database files, so nobody has to delete their data.
- **Every query filters by `user_id`.** There is no database-level security like Supabase's, so services must always scope queries to `req.user_id`. Deleting a user cascades to every table they own.
- **Dependencies are passed in, not imported.** `create_app({ database, uploads_path })` and the `create_*_router(...)` factories take the database as an argument, so tests pass in an in-memory one.
- **AI lives behind server endpoints, through one swappable provider.** Every AI feature is an API route (`POST /api/skills/:id/notes`, `.../quizzes`, `.../topics/generate`, the AI student, and the assistant). The routes call an `ai_provider` object with one fixed shape, so switching AI companies never touches a route. See [AI providers](#ai-providers).
- **Resources first, general knowledge for the rest.** Real AIs build on the student's resources and fill gaps from general knowledge, or work from general knowledge alone when a skill has no resources yet. A quiz on one resource is the exception: it sticks to that resource. See [Topics and quiz scopes](#topics-and-quiz-scopes-phase-6).
- **The learning style quiz lives on the server.** [server/config/learning_quiz.js](server/config/learning_quiz.js) is the only copy of the questions. The sign-up page fetches it, and the server checks answers against it, so editing a question there updates both sides.

---

## Pages and navigation

| Path | Page | Who can see it |
| --- | --- | --- |
| `/` | Homepage: hero, how it works, About us | Everyone |
| `/signup` | Sign up step 1: name, username, email, password | Logged-out visitors |
| `/login` | Login | Logged-out visitors |
| `/signup/learning-style` | Sign up step 2: learning style and goals quiz | Logged-in students |
| `/dashboard` | Redirects to the first dashboard page | Logged-in students |
| `/dashboard/skill-map` | Skills, the topic map, resources, notes and quizzes. `?skill=<id>` picks the skill | Logged-in students |
| `/dashboard/learn` | Learning path, guided lessons, practice, reading and key terms. `?skill=<id>&tab=<path|lessons|practice|reading|terms>` picks the tab (`&topic=<id>` chooses a topic to learn or practise); `?lesson=<id>`, `?practice=<id>` or `?read=<resource id>` opens one | Logged-in students |
| `/dashboard/quiz` | Take and review quizzes. `?quiz=<id>` opens a quiz; `?skill=<id>&topic=<id>` sets one up for a map topic, `?skill=<id>&resource=<id>` for one resource | Logged-in students |
| `/dashboard/teach` | Teach the AI student. `?session=<id>` opens a lesson at whatever stage it's at; `?skill=<id>&topic=<id>` sets one up | Logged-in students |
| `/dashboard/schedule` | The week's study events, the week planner and subject colors | Logged-in students |
| `/dashboard/work-block` | The focus timer. `?event=<id>` links the block to an event | Logged-in students |
| `/dashboard/progress` | Progress bars and comparisons with the period before | Logged-in students |
| `/dashboard/settings` | Account details, email and password, focus timer, learning style, delete account | Logged-in students |
| anything else | Page not found | Everyone |

**How a student moves through sign-up** (all handled by the guards in [RouteGuards.jsx](client/src/components/RouteGuards.jsx)):

1. On `/signup`, submitting the form calls `use_auth().sign_up`, which creates the account and logs in.
2. The sign-up route's `RequireGuest offer_learning_quiz` notices the student is now signed in with an empty `learning_profile`, and redirects to `/signup/learning-style`.
3. The student either saves the quiz (`PUT /api/account/learning-profile`, then `set_account`, then `/dashboard`) or presses **Skip for now** and goes straight to `/dashboard`.
4. Until the quiz is taken, `LearningQuizReminder` shows a banner at the top of every dashboard page linking back to it.

Logging in goes through `get_guest_redirect_path`: the page the student originally asked for (`location.state.from_path`) if there was one, otherwise the dashboard. Logging in never forces the quiz.

**Loading screen.** [LoadingScreen.jsx](client/src/components/LoadingScreen.jsx) appears in three situations:
- for `PAGE_TRANSITION_MS` (600 ms) when moving to another part of the site: the homepage, logging in, signing up, the dashboard. Between two dashboard pages a thin bar runs across the top instead, so the sidebar never blanks out. Set it to 0 in `constants.js` to turn both off
- while a page's code downloads for the first time (pages are lazily loaded). Inside the dashboard this shows in the page's space, beside the sidebar
- while a saved login is being checked on startup

Students whose device asks for reduced motion get a still version. A rule in `theme.css` does the same for every other animation (arrows turning, map nodes growing): the change happens instantly.

**Accessibility built in** (checked with axe in Phase 8, see [Accessibility pass](#accessibility-pass-phase-8)):
- A "Skip to main content" link.
- Focus moves to the new page's `<main>` after navigation.
- Every page has a tab title.
- The Learn page's tabs are links with `aria-current`, so the back button and shared links keep the tab. A new lesson step or re-explanation moves focus to itself, and so does a new reading section.
- Statuses on the learning path ("Done", "Next up", "To do"), right and wrong answers and solved problems are always said in words, with an icon; color only repeats them.
- All form fields have labels, and their hints and errors are linked with `aria-describedby`.
- Errors use `role="alert"` and an icon, never color alone.
- The current sidebar page is marked with `aria-current`, a bar and bold text.
- The mobile menu has `aria-expanded`, moves focus into the drawer when it opens, and closes with Escape.
- Every decorative icon is `aria-hidden`, and the homepage illustration has descriptive alt text.
- Popups use the browser's `<dialog>`, which traps focus, closes on Escape and hides the page behind it from screen readers.
- Resource types always show a text label next to their icon.
- Saved notes and quizzes are native `<details>` blocks, which work with the keyboard and screen readers without extra code.
- The assistant's conversation (and a lesson's) is a scrollable `role="log"` region that takes keyboard focus, so screen readers read new replies as they arrive; every message says "You" or "Assistant" in words, not only by color and side. "Working on it…" is a status message.
- The assistant panel is a non-modal dialog: opening it moves focus to the message box, Escape or the X closes it, and focus goes back to the Assistant button. What it did is listed with a different icon per status plus the status in words for screen readers.
- Voice input is a normal button that says what it does ("Speak instead of typing" / "Stop listening"), and "Listening…" or any microphone problem is announced. Typing always works too.
- Small buttons that repeat a word, like "Quiz me" or "Take out" next to each resource, carry the resource's name for screen readers ("Quiz me on Week 3 notes").

---

## Resources, notes and quizzes (Phase 3)

### Adding a resource

```
AddResourceDialog ── POST /api/skills/:id/resources/{files|links|text} ──▶ skill_resource_routes
                                                                              │ (files go through receive_upload: multer, 25 MB, kept in memory)
                                                                              ▼
                                                                   resource_importer.import_*
   file: file_extractor ─ .pdf → pdf_extractor (pdf-parse)                   │
                          .txt/.md → read as text                            │
                          audio/video → transcriber (Whisper or mock)        │
   link: youtube_extractor (captions + title)  or  article_extractor (Cheerio, via safe_fetch)
                                                                              ▼
                              text_cleanup: normalize → refuse if (almost) empty → cap at 1,000,000 characters
                                                                              ▼
                              file saved to uploads/<user_id>/<resource_id>.<ext>  →  resources row (status "ready")
```

Text is always extracted **before** anything is saved. A file or link that can't be read leaves nothing behind, and the student sees why (for example "That PDF has no text we can read. It may be a scan").

**`safe_fetch` blocks server-side request forgery.** Students paste any link, and the server fetches it, so before every request, redirects included, it checks that the host doesn't point at this machine, the local network or a cloud metadata address. Downloads are also limited in time (15 s) and size (5 MB).

### Making notes and quizzes

```
TopicGenerator ── POST /api/skills/:id/notes { topic } ──▶ note_service.create_study_notes
                  POST /api/skills/:id/quizzes { topic, question_count } ──▶ quiz_service.create_practice_quiz
                                                     │
               topic_resource_service.get_topic_source_text → source_selection
               (~24,000 characters: the matching map topic's own resources first, then the parts of the rest
                that mention the topic most, each chunk labelled with its resource; '' with no resources)
                                                     │
               ai_provider.generate_notes / generate_quiz   (+ the student's learning style)
                                                     │
               notes / quizzes row  →  response (quizzes are sent WITHOUT correct answers)
```

### AI providers

All AI work goes through [server/services/ai/ai_providers.js](server/services/ai/ai_providers.js), which builds one object from `AI_PROVIDER`:

```
{ name,
  generate_notes({ topic, source_text, learning_style }) → { notes_markdown },
  generate_quiz({ topic, source_text, is_source_only, question_count, learning_style }) → { questions },
  generate_topics({ skill_name, source_text, max_topics }) → { topics },
  plan_assistant_step({ tool_names, tool_catalog, context_text, history, message, step_results, step_number, max_steps, learning_style, task_tier }) → { reply_markdown, tool_calls },
  ...the AI student and learning methods (see their sections) }
```

`source_text` may be `''` (the skill has no resources). Real AIs then use general knowledge; the mock refuses with a 422 that explains why; its assistant says so in its reply instead.

| Provider | How it works |
| --- | --- |
| `mock` ([mock_ai_provider.js](server/services/ai/mock_ai_provider.js)) | No AI. Ranks the source sentences by how often they mention the topic. Notes are the top sentences plus key terms; quiz questions are fill-in-the-blank, with other frequent words as wrong answers; topics are the most frequent words; the assistant matches simple requests by their words and otherwise quotes the 3 best-matching sentences. |
| `gemini` / `anthropic` / `openai` ([llm_ai_provider.js](server/services/ai/llm_ai_provider.js)) | Builds a prompt with [ai_prompts.js](server/services/ai/ai_prompts.js) and asks a *completer* for JSON matching a schema. It then checks the answer (`normalize_quiz_questions` drops malformed questions) and adds a learning-style study tip. |

A **completer** is one function, `complete_json({ system_prompt, user_prompt, json_schema, task_tier }) → object`, and it is the only code that knows about a particular AI company. `task_tier` (`light`, `standard` or `build`, from `AI_TASK_TIER`) says how demanding the task is. Gemini uses it to choose a model and how much it thinks (`GEMINI_THINKING_LEVEL`: `build`, for writing app widgets, thinks the most); the others use their single model.
- [gemini_completer.js](server/services/ai/gemini_completer.js): Gemini with `responseJsonSchema`, a model list per tier with fallback, and a thinking level per tier. This file also holds the Gemini transcriber.
- [anthropic_completer.js](server/services/ai/anthropic_completer.js): Claude with structured outputs and server-side refusal fallbacks.
- [openai_completer.js](server/services/ai/openai_completer.js): OpenAI with a strict `json_schema` response format. This file also holds the Whisper transcriber.

**To add another AI company:**
1. Write a new completer.
2. Add a branch in `create_named_ai_provider`, and a choice for it in `CHAT_ASSISTANTS`.
3. Add the name to `AI_PROVIDER_NAMES` in `constants.js`.

**Prompt safety.** Resource text goes inside `<sources>` tags, and the system prompt says it is reference material, never instructions. That way a sentence inside a student's PDF can't redirect the AI.

**How much the AI may add.** `SOURCE_RULES` in [ai_prompts.js](server/services/ai/ai_prompts.js) has three versions, and `get_source_rules` picks one per request:
- `blended` (the default): build mainly on the sources, fill gaps with accurate general knowledge, and point out a source that looks wrong.
- `only_sources`: everything must come from the sources. Used for a quiz on one resource.
- `no_sources`: the skill has no resources, so use general knowledge at a student's level.

Notes and assistant replies also get `PLAIN_MARKDOWN_RULE` (no LaTeX), because the app shows plain Markdown.

**Learning style.** [learning_style_hints.js](server/services/ai/learning_style_hints.js) holds the study tip added to every set of notes, and an instruction telling real models how to shape the notes (for example "use tables" for visual learners).

---

## Skill map, quizzes and grading (Phase 4)

```
Skill map page ── TopicMapSection ── GET /api/skills/:id/topics ──▶ topic_service.get_topic_map
                      │                                         { topics (with mastery_level), suggestions }
                      ├── SkillOverview   (strong count, a bar split by level, the key with counts)
                      ├── TopicMap        (radial map with levels and centring, or a folder-style outline)
                      │     beside TopicPanel on wide screens / TopicDialog popup on narrower ones
                      ├── StudyNextPanel  (up to 3 suggestions, each with a reason)
                      └── TopicManager ── POST /topics/generate (AI reads all resources) or POST /topics (by hand)
                      "Quiz me on …" in Study next ──▶ /dashboard/quiz?skill=…&topic=…

Quiz page ── QuizWorkspace: QuizSetup ── POST /api/skills/:id/quizzes { topic_id } ──▶ quiz (no answers)
                            QuizRunner ── POST /api/quizzes/:id/check   (only for "right after each question")
                                       └─ POST /api/quizzes/:id/results ──▶ grade → save → update topic mastery
                            QuizResults (score, the topic's new level, review of every question)
```

- **Topics.** "Find topics in my resources" asks the AI (Gemini Flash-Lite, light tier) for up to 10 topics: broad main topics (units) with smaller topics under them. They're read from an even sample of every resource (`select_overview_text`), so one long resource can't crowd out the rest. A skill with no resources gets "Suggest topics for …" instead, which lists what a typical course covers. Topics the skill already has are kept as they are, including their quiz history.
- **Understanding level.** Each topic's `mastery_score` is the average of the student's last 3 quiz scores on it.

  | Level | Score | Color | Icon |
  | --- | --- | --- | --- |
  | Strong | 80% or more | green | check |
  | Developing | 50–79% | yellow | dash |
  | Needs work | under 50% | red | X |
  | Not tested | no quiz yet | gray | question mark |

  Every node also says its level in words ("Needs work · 33%"). The thresholds live in `MASTERY_THRESHOLDS` in `server/config/constants.js`.
- **What to study next.** `rank_study_suggestions` lists up to 3 topics: weakest first, then untested, then developing. These get a "Next" tag on the map and a card in "Study next".
- **Which quizzes count.** A quiz counts toward a topic when it was started on that topic (`topic_id`), when its typed topic matches a map topic's name, or when it covers one resource filed under that topic. Quizzes on a whole skill don't change any one topic.
- **Answer feedback timing.** This follows the student's answer to "When you take a quiz, when do you want to see the answers?" in the learning style quiz.
  - Right after each question: each answer is checked with `/check` and locked, and there's no going back.
  - At the end (the default): the student can move back and forth before finishing.
  - Either way, the grade comes from `/results`, which checks every answer on the server.

## Schedule and work blocks (Phase 5)

- **Schedule.** The week is shown as an agenda: one row per day, with events as cards.
  - Each card shows the subject's color as a stripe and its name in text, plus Start work block, Edit and Remove buttons.
  - Times are stored in ISO (UTC) and shown in the student's own time zone.
  - Subject colors are each skill's `color`, changed under "Subject colors".
- **Plan my week** ([study_planner.js](client/src/utils/study_planner.js)) suggests sessions from the learning style quiz answers:
  - the weekly study time decides how many sessions (for example, 2–5 hours becomes 210 minutes);
  - the preferred times of day decide when (morning 9:00, afternoon 15:00, evening 18:00, late night 21:00);
  - the focus length (`work_minutes`) decides how long each session is.

  Sessions are spread one per day before doubling up. They skip the past and anything already scheduled, and they go to skills with weak or untested topics first. The student unticks any they don't want, then adds the rest. A student who skipped the quiz gets default answers, plus a prompt to take it.
- **Work blocks.**
  - **Timer:** a focus period (`work_minutes`), then a break (`break_minutes`).
  - **Survives reloads:** the timer is worked out from the block's `started_at` rather than counted down in the browser, so a page reload or a sleeping tab doesn't break it; `GET /work-blocks/active` picks the block up again.
  - **End of focus:** the block is recorded with its full minutes, a chime plays, and screen readers hear "Take a 5-minute break".
  - **Ending early:** the minutes actually spent are recorded.
  - **Activity dropdown:** switches the panel below the timer between the event's assignment (title and details) and a full quiz on the event's subject (the same `QuizWorkspace` as the Quiz page).

## Topics and quiz scopes (Phase 6)

**Topics as units with their own resources.** A topic can be broad, like "Unit 3: Cell biology", with smaller topics under it. Any resource can be filed under a topic (`resources.skill_node_id`):
- when adding it (the "Topic (optional)" choice in Add resource, or "Add a new resource" inside a topic);
- later, with "Move here" in the topic popup (`PATCH /api/resources/:id { topic_id }`). "Take out" files it back under the skill in general.

Choosing a topic on the map opens **TopicDialog**: its level, "Quiz me on this topic", "Ask the assistant", its resources (including those filed under its subtopics, labelled "in …"), and the tools above. Deleting a topic keeps its resources.

**What a quiz can cover** (`scope` on `POST /api/skills/:id/quizzes`, picked in "What to quiz on"):

| Scope | Body | What the AI reads (`quiz_service.plan_quiz`) | Counts toward |
| --- | --- | --- | --- |
| `skill` | `{ scope: "skill" }` | An even sample of every resource. "All of Biology" | No single topic |
| `topic` | `{ topic_id }` or `{ topic }` | The topic's own resources first (and its subtopics'), then matching parts of the rest of the skill (`select_focused_source_text`) | That topic |
| `resource` | `{ scope: "resource", resource_id }` | That one resource, sampled from start to end (`order_for_even_coverage`), and nothing else | The topic it's filed under, if any |

With a real AI, every scope works with no resources at all: the questions come from general knowledge. Retaking a quiz ("New quiz on this topic") keeps its scope.

**The chatbot** that Phase 6 added (one conversation per skill on its own page) was replaced in Phase 10 by [the assistant](#the-assistant-and-widgets-phase-10), which is open on every page and can act in the app as well as answer questions.

## Topics like folders, and the skill map (Phase 7)

**Any level of detail.** Topics nest like folders, up to `MAX_TOPIC_DEPTH` (6) levels: a unit can hold topics, which can hold smaller topics, and so on.
- **Adding detail:** "Add a subtopic" or "Break into subtopics with AI" in a topic's details (`POST /api/topics/:id/generate`), or "Add a topic" with any topic as "Part of".
- **Reorganising:** "Rename, move or remove" (`PATCH /api/topics/:id { topic?, parent_topic_id? }`). A topic moves with everything under it, can't move inside its own branch, and can't end up deeper than the limit.
- **Removing** works like deleting a folder but keeping its contents: its subtopics and resources move up to its parent. Its quizzes and notes are kept.
- **What counts toward a topic:** a quiz on a broad topic reads the resources filed under it and under every topic below it.

**The map.**
- **Overview card:** how many topics are strong, a bar split by level, the key with counts, and the number of topics, levels and resources.
- **Map view** (wide screens): a radial tree. The skill sits in the middle and each level has its own ring, with curved links and the path to the chosen topic highlighted. Each branch gets a slice of the circle by the square root of its size, so one big branch can't squeeze its siblings.
  - "Levels shown" (1, 2, 3…) hides deeper levels; a "+7" badge counts what's hidden under a node. It starts at 2.
  - On a crowded ring, nodes get smaller, drop their level text and "Next" tag (icon, color and the button's spoken name still give them), and on the first ring every other node moves in a little.
  - **Centre the map here** (on a topic with subtopics) puts that topic in the middle with only its branch around it. A path above the map ("All of Biology › Photosynthesis") goes back up.
- **Outline view** (always on phones): the topics as folders that open and close, with "Expand all" / "Collapse all". Each row shows the level and what the topic holds ("2 subtopics · 1 resource"). The chosen topic's parents open automatically.
- **Topic details** show beside the map on screens 1024px and wider (`TopicPanel`), and in a popup otherwise (`TopicDialog`). Both show the same `TopicDetails`:
  - the topic's path, with each broader topic a link;
  - its level, summary, and how the topics under it are doing ("Under this topic: 2 not tested");
  - Learn it step by step, Practise it, Quiz me, Teach it to Pip, Ask the assistant, and Centre the map here;
  - its subtopics, its resources, and editing.

## Teach the AI student (Phase 7)

The student explains a topic to **Pip**, an AI student that knows nothing except what it's taught. Then they both take the same quiz.

```
TeachPage (?session=)
  TeachSetup ── POST /api/skills/:id/teach-sessions { topic_id | topic } ──▶ lesson, opened by Pip's greeting
  TeachLesson ── POST /api/teach-sessions/:id/messages { message } ──▶ ai_provider.reply_as_ai_student
       (typed or spoken; up to 15 explanations)        Pip says back what it understood and asks one question
  "Finish and quiz us both" ── POST /api/teach-sessions/:id/quiz { question_count }
       quiz made on the topic (create_practice_quiz) ──▶ ai_provider.take_quiz_as_ai_student
       (Pip answers from the lesson alone; its answers are saved but hidden)
  TeachQuiz ── QuizRunner with submit_answers ── POST /api/teach-sessions/:id/results { answers }
       student graded (updates the topic on the skill map) ──▶ combined_score saved
  TeachResults: teaching grade, both scores, Pip's note, every question with both answers and Pip's reasons
```

- **The stages** are worked out from the row (`get_teach_session_status`): `teaching` until the lesson has a quiz, then `quiz` until the student has answered, then `done`. The address keeps the lesson (`?session=`), so a reload carries on where it was.
- **Keeping Pip honest.** `AI_STUDENT_RULES` in [ai_prompts.js](server/services/ai/ai_prompts.js) tells the model it knows only the lesson.
  - For the quiz, Pip answers each question with a choice number, or 0 for "don't know". `normalize_ai_student_answers` turns anything missing or out of range into "don't know".
  - Practice mode's Pip ([mock_ai_student.js](server/services/ai/mock_ai_student.js)) really does know only the lesson. It picks the choice the lesson's words mention most, and asks about the longest key word in each explanation.
- **Grading.** The teaching grade is `TEACH_SCORE_WEIGHTS` (half the student's score, half Pip's). Only the student's score moves the topic on the skill map.
- **Quizzes from lessons** are hidden from the skill's quiz list (`list_quizzes`). If Pip can't answer (the AI is busy), the new quiz is removed again, so the lesson can carry on.
- **Quiz page.** "AI student's quiz" lists recent lessons from every skill with Pip's score, the student's and the teaching grade, and a Review or Continue link.
- **Past lessons** for the chosen skill are listed under the setup form, with Review / Continue and Delete. Deleting removes the lesson's quiz and both results too.

## Settings and progress (Phase 8)

### Settings

`/dashboard/settings` has one form per part of the account. Each form sends only what changed ("Nothing has changed." otherwise), and every save updates the signed-in account straight away, so the sidebar name and the timer change without a reload.

| Section | Fields | Notes |
| --- | --- | --- |
| Your details | First name, last name, username | Same rules as sign-up; a taken username shows under the field |
| Email and password | Email, new password (twice), current password | **The current password is needed** to change either, so someone at an unlocked computer can't take the account. A new password logs out every other device |
| Focus timer | Focus minutes (5–120), break minutes (1–60) | Used by every new work block and by "Plan my week" |
| Learning style and goals | The quiz answers in words | "Retake the quiz" opens the same quiz filled in with the saved answers; "Take the quiz" if it was skipped |
| Appearance | Match my device, Light, Dark | Saved on this device; other open tabs follow (Phase 11) |
| Delete account | Password | A popup lists everything that goes (skills, topics and uploads; notes, quizzes and results; chats and lessons; schedule and work blocks), with "Delete my account" and "Keep my account" |

After deleting, the site goes to the homepage and forgets the login (`forget_account`), without calling the server again.

### Progress

`/dashboard/progress` shows progress bars and improvement over time only: **no streaks, badges or levels.** Everything comes from one request, `GET /api/progress` ([progress_service.js](server/services/progress_service.js)).

- **Headline numbers** (`StatTile`): average quiz score (last 30 days), focus time (last 7 days), strong topics, and the teaching grade. Each says how it changed compared with the period before, in words ("Up 8 points on the 30 days before"), with an arrow and a color that only repeat what the words say.
- **Focus time chart** (`StudyTimeChart`): minutes of focus per day for the last 14 days, in the student's own time zone. One series, so the heading names it and there's no legend. The busiest day is labelled, every column shows its value on hover, and "Show as a table" lists every day. Screen readers get a one-sentence summary.
- **Skills** (`SkillProgressList`): two bars per skill, "Topics quizzed" and "Topics strong", with the numbers written beside them.
- **Topic changes** (`TopicChanges`): "Most improved" and "Worth another look", from each topic's first to latest quiz score (topics quizzed at least twice; up to 5 each).

The periods are `QUIZ_SCORE_PERIOD_DAYS`, `STUDY_TIME_PERIOD_DAYS` and `STUDY_TIME_CHART_DAYS` (server and client constants). A change only shows when both periods have something to compare.

### Accessibility pass (Phase 8)

Every page and open state was scanned with [axe-core](https://github.com/dequelabs/axe-core) (WCAG 2.2 AA and best practices) at desktop and phone widths: the public pages, all 8 dashboard pages, the learning style quiz, a topic's details, the delete popup, a lesson in progress and the phone menu. The scan found three problems, all fixed, and now reports none:

| Found | Fix |
| --- | --- |
| The topic panel was an `<aside>` inside `<main>` | It's a named `<section>` (a region) |
| `role="log"` was on the chat's `<ol>`, which hid its list items | The log is a wrapper `<div>` around a plain list |
| The chat's scrolling area couldn't be reached by keyboard | It takes focus (`tabIndex={0}`), so arrow keys scroll it |

Running the lesson form in a real browser also showed a timing bug: for a moment after switching skills, an empty topic list switched the form to "Type my own topic" and allowed Start. TeachSetup and QuizSetup now tag the loaded topics with their skill and wait for the chosen skill's list. Animations now also respect reduced motion everywhere (see [Pages and navigation](#pages-and-navigation)).

## Learning features (Phase 9)

Everything before this phase mostly checks what a student already knows (quizzes, the skill map, progress). Phase 9 adds a **Learn** page (second in the sidebar) for learning new things. Each feature builds on the student's resources first and fills gaps from the AI's general knowledge, like the rest of the app, and suits the learning style from the quiz. Practice mode (no API key) has a version of each one built from sentences in the resources.

| Tab | What it does | Where it's stored |
| --- | --- | --- |
| **Learning path** | The AI puts the skill's topics in the order to learn them, foundations first, with a sentence on why each comes where it does. Each step is **Done** (its guided lesson was finished, or quizzes show it's strong), **Next up** (the first that isn't) or **To do**, with Start lesson / Continue lesson / Learn it again, Practise and Quiz me. A skill with no topics gets them found first. Topics added later go at the end, marked "new", until the path is reordered | `learning_paths` (one per skill) |
| **Guided lessons** | The AI teaches a topic in 3 to 6 short steps. Each step has one idea, an example and a check question. A wrong answer shows why, then offers **Explain it another way**: the idea taught again from the misunderstanding, with a new question (up to twice per step). Later steps stay hidden until the student gets there. At the end: how many checks were right first time, and links to practise, quiz or teach the topic | `guided_lessons` |
| **Practice** | A worked example, then 1 to 5 problems the student solves. **Check my answer** has the AI judge a typed answer and nudge without giving it away. **Show a hint** reveals up to 3 hints, each giving more away, and **Show the solution** gives the worked steps. Nothing is graded and the skill map doesn't change | `practice_sets` |
| **Reading** | Reads one resource a section at a time (sections start at headings and are about 2,500 characters). Each section gets a plain-language guide and a "Think about" question, made the first time and kept. Selecting words in the text copies them into **Stuck on something?** for an explanation; a question can be typed there too. The place is saved | `reading_guides`, `resources.reading_section` |
| **Key terms** | **Find key terms** has the AI pick out terms and plain definitions, each linked to a topic by name; terms can be added by hand, searched and deleted. A topic's terms also show in its details on the skill map | `glossary_terms` |

**Explain it another way** (Simpler, Give an analogy, Show an example, Go deeper) appears on lesson steps, reading sections, saved study notes and topic summaries. It sends the text plus the skill's matching resources to the AI and shows the answer underneath. Nothing is saved.

**Ways in from the rest of the app:** a topic's details on the skill map have **Learn it step by step**, **Practise it** and its key terms; every resource has a **Read** link; a finished lesson links to practice, a quiz and teaching Pip.

**Keeping answers hidden.** As with quizzes, the server never sends a check question's answer before it's answered, nor a practice problem's hints and solution before they're asked for, so they can't be read in the browser's network tab.

## The assistant and widgets (Phase 10)

The **Assistant** button sits in the corner of every dashboard page. It opens a side panel (the whole screen on phones) with one conversation per student. The assistant answers questions about what the student is studying (from their resources first, then general knowledge), and does things in the app for them: almost anything the student could do by clicking. It can also make **widgets** and small **custom tools**.

```
AssistantPanel ── POST /api/assistant/messages { message, page, utc_offset_minutes }
                                  │
  run_assistant_turn: up to 5 steps (ASSISTANT_MAX_STEPS)
    step: the chosen AI gets the rules, every tool's description, an overview (the student,
          their time, the page they're on, their skills with ids, the next week, their
          widgets), the last 12 messages, the new message and the results so far
          ──▶ { reply_markdown, tool_calls: [{ tool, arguments_json }] }
    each tool call runs here with the student's own permissions (services/assistant/*_tools.js),
    using the same validators and services as the website's routes
    no tool calls ──▶ that reply is the answer
                                  │
  saved: the message and the reply with its actions ──▶ assistant_messages
  returned: client_actions (open a page) and data_changed (the page reloads its data)
```

**What it can do** (each tool is listed in [Server reference](#files-and-functions)):

| Area | Tools |
| --- | --- |
| Skills, topics, resources | list, create, rename and delete skills; read the topic map; add, rename, move and delete topics; find topics or break one into subtopics with AI; list, search and read resources; add typed notes and links; file resources under topics; delete resources |
| Studying | list and read notes; make notes; make quizzes (on a topic, a resource or a whole skill) and list results; progress |
| Learning | the learning path (read or plan); guided lessons; practice problems; key terms (list, find, add); set up a lesson to teach Pip |
| Planning and settings | list, add, change and remove schedule events; change name, username and focus timer lengths |
| Widgets | list, make, change and delete widgets; pin them to pages; set their width, whether they float and where, their look and accent; fold them away; make and take apart Smart Stacks |
| Moving around | open any dashboard page (it uses the links tools return, like a quiz it just made) |

- **Deleting waits for the student.** Tools that delete (skills, topics, resources, events, widgets) aren't run straight away: the panel shows **Confirm** and **Cancel**, and only Confirm runs them (`POST .../actions/:id/confirm`).
- **The email and password** can't be changed by the assistant; they need the current password in Settings.
- **Nothing is hidden.** Every reply lists what the assistant did, with its outcome and an **Open** link. A widget it made shows right there in the chat.
- **Failures are explained.** A tool that fails (a bad argument, a name that's taken) reports why to the AI, which can fix the call or explain. If the AI itself fails part-way, what was already done is still saved and listed; if it fails before doing anything, nothing is saved and the message goes back into the box.
- **Text from resources is data.** The overview, earlier messages and tool results are marked as information, never instructions, so text inside a resource can't redirect the assistant.
- **The page stays current.** Every request that saves something, the assistant's included, tells the page to reload what it shows (see [Keeping everything in step](#keeping-everything-in-step)).
- **Questions from elsewhere.** "Ask the assistant" on a topic opens the panel with "Help me understand <topic> in <skill>." typed in, not sent.
- **Practice mode** understands simple requests by their words: open a page, create a skill, add a topic, quiz me on…, make notes on…, make a checklist: a, b, c, how am I doing, what's on my schedule. Anything else quotes the best-matching sentences from the resources.

**Widgets.** The assistant makes two kinds ([widget_specs.js](server/services/widget_specs.js) checks and trims everything it writes):

| Kind | What it is | Examples |
| --- | --- | --- |
| **card** | Built from safe blocks: `markdown`, `checklist` (ticks are saved), `countdown` (to a date and time), `timer` (a length of time the student starts), `flashcards`, `links` (dashboard pages only) and `live` (the student's own data, always current: weak topics, upcoming events, progress summary, next on the learning path, recent results) | "a countdown to my exam", "a 30 minute timer", "flashcards on photosynthesis", "a checklist for this week", "show my weak topics on every page" |
| **app** | A small self-contained HTML page the AI writes, for anything interactive | "a Celsius to Fahrenheit converter", "a molar mass calculator", "a times tables game" |

- **Apps are sandboxed.** They run in an `<iframe sandbox="allow-scripts">` with no same-origin access (so they can't read the login token or call the API), and a Content-Security-Policy (`APP_WIDGET_POLICY`) placed first in the page, which blocks every network request, form and outside file. In the browser test, an app's `fetch` and `localStorage` were both blocked.
- **Pinning.** A widget can be pinned to one page, to every page, or not at all. Pinned widgets show above the page (`WidgetShelf`); every widget is in the panel's **Widgets** tab, where it can be pinned, renamed, folded away or deleted. A student can have 50.
- **Widget windows and Smart Stacks.** See [Widget windows](#widget-windows-and-smart-stacks) below.
- **When it makes them.** When asked, and on its own when one would clearly help (it says so), at most once a conversation.

### Widget windows and Smart Stacks

Every widget on a page is a small window ([WidgetWindow.jsx](client/src/components/widgets/WidgetWindow.jsx)), in the app's own style: rounded corners, a slim title bar, controls that appear on hover (always on touch screens), and a soft pop when menus and new windows open. Its layout is saved with it on the server, so it looks the same on every device and after a reload.

| | Docked | Floating |
| --- | --- | --- |
| **Where** | In the grid above the page; pushes the page down | A window above the page. **On the page**: scrolls with it. **On screen**: stays in view, to the right of the sidebar |
| **Move** | Drag the title bar; drop beside another item (a bar shows where), or **on its middle to stack them** (a ring shows) | Drag the title bar anywhere; let go near an edge and it settles against it. Touching a window brings it to the front |
| **Resize** | Right edge, bottom edge or corner. The width snaps to a third, half, two thirds or the whole page; the height is free | Any edge or corner, freely, within 220–1600 × 120–1600 px |
| **Keyboard** | Grip (⠿): arrow keys move a place, Home and End to either end. Corner: left/right width, up/down height | Grip: arrow keys move 24 px. Corner: arrow keys grow or shrink 40 px |
| **Switch** | The **Float** button in the title bar, or **Layout** in the ⋯ menu | The **Dock** button, or **Layout** |

- **While resizing,** a badge shows the size ("Large · 320 px", "480 × 320"); when it's let go, the new size is announced to screen readers.
- **The ⋯ menu** has the quick things: **Layout** (Docked or Floating; Size, Fit height and Move earlier/later when docked; **Stays** On the page or On screen and Reset size when floating), **Stack with…**, where it shows, **Customize…** (see [Customizing widgets](#customizing-widgets-looks-pages-and-hiding)), **Hide**, **Title** and **Delete**. It opens upward when there's more room above.
- **Content that fits its window.** Each window measures its content area as it's resized and works out a shape (`describe_shape`): a size from its width (compact below 280 px, large from 520 px, regular between) and, when its height is set, an orientation (landscape, square or portrait). Every block lays itself out for that shape:

  | Block | Compact | Regular | Large or landscape |
  | --- | --- | --- | --- |
  | Countdown | One big number (days, or hours on the last day) | Day and hour tiles | Day, hour and minute tiles |
  | Checklist | Round accent checks, smaller text, a progress bar | The same, in body text | Two columns from four items |
  | Flashcards | A card that turns over when pressed, with round previous and next buttons and "1 / 2" | A taller card, larger text | With a set height, the card fills it |
  | Links | A grouped list with chevrons | Rounded pills | Rounded pills |
  | Live data | The first three, one line each | Rows with their detail | Tiles in two columns |
  | Notes (Markdown) | Smaller text | Body text | Body text |

  **Content size** in the menu (Auto, Small, Medium, Large) fixes the layout instead of following the width. The window's padding tightens when compact.
- **The controls.** The title bar has an icon tile for the kind of widget (checklist, countdown, flashcards, links, live data, notes, app or stack) in the widget's accent; the stack count as a small pill; and a capsule on the right with the Float/Dock and ⋯ buttons, which fills in on hover. The grip and the resize arc show on hover or keyboard focus (always on touch screens), and a window's bottom padding keeps its content's own buttons clear of the resize corner.
- **Smart Stacks** show several widgets in one place, one at a time. Make one by dropping a docked item onto the middle of another, with **Stack with…**, or by asking the assistant. A stack has two views (**Stack view** in its menu):
  - **Swipe**: the widgets sit side by side and snap into place, so a finger or trackpad swipes between them; dots and arrows below pick one, as do the arrow keys on the focused track.
  - **List**: a row of title pills to pick from.

  Its menu also has **Take out "…"** (one widget) and **Unstack all**. A stack left with one widget comes apart by itself, and widgets taken out show where the stack was. Dropping a stack on another merges them.
- **Phones** have no room for floating windows, so they show docked there (the menu says so). Phones show one item a row, so only heights change.
- **Collapse all / Expand all** sit above the docked items when there are two or more.
- **The assistant** can float or dock a widget, set where it stays, its look (every Customize setting), its pages, hide it, and make or take apart stacks ("float my countdown and keep it on screen", "stack my checklists", "make it glass and a bit more see-through").
- **While anything is dragged,** `<body data-dragging>` stops app widgets' frames taking the pointer, so a drag that passes over one isn't lost inside it.

### Finished widgets: glass, the app kit and better AI widgets

- **Glass is real glass.** What's behind a glass widget shows through at its own colours, frosted as much as the widget's settings say (see [Customizing widgets](#customizing-widgets-looks-pages-and-hiding)). Around the edges the page bends like light through thick glass. A rim catches the light (bright at the top left, a glint at the bottom right), faint inner shadows give the pane thickness, and floating glass casts a deeper shadow. How it's built:

  | Part | How |
  | --- | --- |
  | Frosting | `.widget-glass-pane`, a layer behind the window's content (`z-index: -1` in a window that isolates), filled with `--glass-fill` (the tint at its opacity) and filtered by `--glass-filter` (frost and colour boost), both set by `build_look_style`. It isn't on the window itself because Chromium then frosts the window's own content too when it holds an app's frame |
  | Bending | [GlassRefraction](client/src/components/widgets/GlassRefraction.jsx): an SVG filter (`backdrop-filter: url(#…)`) with a displacement map drawn for the window's size and corner radius ([utils/glass.js](client/src/utils/glass.js)): near the rounded edge each point takes the page from further in, fading out `GLASS_BEVEL_PX` from the edge, by up to `GLASS_MAX_BEND_PX` at full edge bend. The map sits on a neutral grey layer (`feFlood` under `feComposite`), so wherever it doesn't reach nothing moves. Only Chromium browsers (Chrome, Edge) can filter what's behind an element this way (`can_refract_backdrop`); others keep the frosting and rim |
  | Rim | `.widget-glass-rim`, a 1.5 px gradient ring (its own element, since the window's `::before` and `::after` mark drops) |

  **The edge bug, fixed.** The first version showed dark bands and coloured fringes along the edges. A side-by-side test in Edge found two causes: the map is drawn at half size and stretched, so its outer pixels blended with transparent black, which reads as "take the page from far up and left" and pulled in empty space from outside the window; and red, green and blue were bent by different amounts, which fringed every edge with colour. The neutral layer fixes the first, and one bend for all colours fixes the second. The old fixed colour boost (180%) and brightening, which changed the colours behind, are gone too: colour boost is now a setting, and it starts at 100% (true colours).

  Glass shows best floating over the page; docked over the plain background there's little behind it to see. Everything inside follows the look: each window has `data-appearance`, which sets `--widget-soft` and `--widget-line` for the soft panels inside (flashcards, tiles, buttons, progress tracks, the stack pills). They're opaque on solid widgets, see-through on glass ones (so the frosting isn't covered up) and lightly accented on tinted ones.
- **Apps are see-through too.** An app's frame has no border or background, and its page is transparent, so an app looks like part of its widget in any look.
- **The app design kit.** Every app page starts with a small stylesheet (`build_app_styles`) that matches StudyApp in light and dark, in the widget's accent:

  | Part | What it gives |
  | --- | --- |
  | Variables | `--accent`, `--on-accent`, `--text`, `--muted`, `--soft`, `--line`, `--radius` |
  | Layout | `.stack` (a column), `.row` (a wrapping row), `.grid` (tiles that fit the width) |
  | Pieces | `.tile` (a soft rounded panel), `.big` (a large number), `.label` (a small caption), `.muted`, `.pill` |
  | Controls | `button` (the accent button, white text at 4.5:1 or better), `button.secondary`, `button.ghost`; inputs, selects, ranges and tables already styled |
  | Sizes | `.only-compact`, `.hide-compact`, `.only-large` |

  The kit uses `:where()`, so anything the AI styles itself wins.
- **Apps know their size.** The widget sends its shape to the app (`APP_SHAPE_MESSAGE`) when it loads and whenever it's resized, which sets `<html data-size>` (compact, regular or large) and `data-orientation`. The page only takes this message from its own parent, and only known values. Pages start at "regular".
- **Advanced apps: the app builder.** The assistant doesn't write an app's code. It writes a brief (every control, behaviour and fact the app needs) and calls `create_widget` or `update_widget` with it. A separate AI call, the app builder (`build_widget_app`, [widget_app_prompts.js](server/services/ai/widget_app_prompts.js)), writes the code with Gemini Flash on the `build` tier (more thinking), from a detailed guide (`APP_BUILDER_GUIDE`): the sandbox's rules, the kit, sizes, a quality bar and two complete example apps ([widget_app_examples.js](server/services/ai/widget_app_examples.js)). The request ends with the checks it will face (`APP_FINAL_CHECKS`). `build_app_spec` checks each version; one that fails goes back with what was wrong, up to `APP_BUILD_ATTEMPTS` (2) tries. A build takes about 30 to 80 seconds, and the chat says bigger jobs take a minute or two after 10 seconds (`ASSISTANT_LONG_WAIT_MS`).
- **What apps can use: `window.kit`.** The sandbox blocks `eval()`, storage and the network, which is how an AI would normally build a calculator or remember things, so every app page gets a kit ([utils/app_kit.js](client/src/utils/app_kit.js), copied into the page as source):

  | Function | What it does |
  | --- | --- |
  | `kit.calc(expression, { angle })` | Safe maths: a parser, so nothing typed is run as code. + − × ÷ ^, brackets, implied multiplication (2π, 3(4+1)), ! and %, sin cos tan (degrees or radians) and their inverses, sqrt, cbrt, ln, log, exp, abs, rounding, min, max, mod, π, e, τ and `ans`. Errors are written for students ("A bracket is missing"). Floating point noise is removed (0.1 + 0.2 is 0.3) |
  | `kit.format(number)` | "1,234.5", or "1.5e20" for very large and small numbers |
  | `kit.units`, `kit.convert(value, from, to)` | 13 categories: length, mass, time, temperature, volume, area, speed, data, energy, pressure, force, power and angle |
  | `kit.save(data)`, `kit.load()` | Remembers settings, history or scores with the widget (up to `APP_STATE_MAX_LENGTH`, kept as `state.app`). Saves are sent `APP_SAVE_DELAY_MS` after the app stops saving, or when it closes, and never reload the app |
  | `kit.size()`, `kit.on_size(listener)` | The widget's shape, for layouts drawn in script (like a canvas graph) |

  The kit's stylesheet also has calculator pieces (`.display` with `.expression` and `.result`, `.keypad` with `.accent`, `.muted` and `.wide` keys), `.field` (a label above its input) and `.segmented` choices (`aria-pressed`).
- **Apps that wouldn't work are turned down**, saying why, so the builder fixes them:
  - **Unfinished html** (`find_incomplete_html`): no `<script>`; an unclosed `<script>`, `<style>`, `<textarea>` or comment; or it stops mid-tag. In testing, Gemini once returned a graphing calculator cut off after 529 characters.
  - **No compact version** (`APP_SIZE_HOOKS`: the kit's size classes, `data-size`, container or media queries, or `kit.on_size`; `APP_SIZE_ERROR`).
  - **Blocked code** (`APP_BLOCKED_CODE`): `eval`/`new Function` (use `kit.calc`), storage (use `kit.save`), the network, `alert`/`confirm`/`prompt`, or timers given strings.

  The height script also goes first in the page, so no unfinished markup can swallow it.
- **Practice mode** makes a real calculator or unit converter when asked ("make me a calculator"), or a counter for anything else: the same example apps the builder learns from.
- **A better widget guide.** `WIDGET_GUIDE`, which the assistant reads with its widget tools, covers what makes a good widget (one purpose, readable at a glance, a short title), when to use a card rather than an app, limits for each block, what apps can do and how to write a full brief, and how to place a widget (which width, look and accent suit it). The assistant's rules add: follow the guide, fill widgets with the student's real content, and write a complete brief for apps.
- **Checked live** with the default assistant (Gemini Flash-Lite writing the brief, Flash building). Each app was used in the browser:

  | Asked for | What it did |
  | --- | --- |
  | A focus timer | Compact version hides the length buttons |
  | A scientific calculator with trig in degrees or radians and recent answers | Typed `2+3*4` gave 14, `(1+2)^2` gave 9, `1/0` a friendly message; history kept |
  | A physics unit converter | 5 nm gave 0.005 µm |
  | A SUVAT solver | Labelled s, u, v, a, t inputs, presets, says which equation it used, and asks you to clear one when given four values |
  | A graphing calculator | Plots `x^2 - 3` on a canvas with axes, grid, presets and zoom; compact shows just the function and the graph |

  All passed axe in solid, glass and tinted windows, in light and dark.

### Customizing widgets: looks, pages and hiding

**Customize…** in a widget's ⋯ menu opens a panel at the side of the screen ([CustomizeSheet](client/src/components/widgets/CustomizeSheet.jsx)). Changes show on the widget as you make them, like the settings for a widget on a phone, and are saved once they stop for `WIDGET_LOOK_SAVE_DELAY_MS` (or straight away on **Done**). It isn't modal, so the page stays usable; Escape closes it and puts focus back on the ⋯ button.

| Section | Settings |
| --- | --- |
| Look | Style (Solid, Glass, Tinted), Accent (seven colours). Tinted: **Tint strength** (0–40%). Glass: **Glass tint** (Neutral or the accent), **Opacity** (0–90%; 0 is clear glass), **Frost** (0–24 px of blur), **Edge bend** (0–100%; Chrome and Edge) and **Colour boost** (100–200%; 100 keeps the page's own colours) |
| Shape | Corners (Subtle 14 px, Round 22 px, Extra round 30 px), Shadow (None, Soft, Deep), Content size (Auto, Small, Medium, Large), and **Reset look** (back to `DEFAULT_WIDGET_LOOK`, keeping the style and accent) |
| Pages | **Every page**, or any choice of pages as checkboxes. Taking one page off "every page" leaves all the others (`toggle_pinned_page`). Not for a widget inside a stack, whose stack decides |
| Visibility | **Hide from every page** |

- **Pages are a list.** A widget or stack has `pinned_paths`: `[]` (only in the Widgets tab), `["*"]` (every page) or a list of pages. Older databases had one page in `pinned_path`; `move_pinned_paths` copies it into the list once and clears it.
- **Hiding isn't deleting.** A hidden widget (`is_hidden` in its layout) shows on no page but stays in the assistant's Widgets tab with a **Hidden** label; **Show on its pages** (in its ⋯ menu) brings it back where it was. **Hide** is in the ⋯ menu too.
- **Looks are CSS variables.** `build_look_style(layout)` sets `--widget-radius`, `--widget-tint`, `--glass-fill` and `--glass-filter` on the window, which [theme.css](client/src/styles/theme.css) uses (`.widget-tinted`, `.widget-glass-pane`); shadows come from `data-shadow` on `.widget-window` (`data-lifted` while a docked window is dragged).
- **The server checks every setting** (`WIDGET_CORNERS`, `WIDGET_SHADOWS`, `WIDGET_GLASS_TINTS`, and `WIDGET_LOOK_NUMBERS`, rounded and kept within their limits).

### Timers, countdowns and common sense

Asked for "a 30 minute countdown", the assistant used to make a countdown to a date 30 minutes away, which showed 0 days and 0 hours, with the minutes only at larger sizes. Three changes fix this kind of thing:

- **A timer block.** `timer { label, seconds }` is a length of time the student starts: a progress ring with the time left, Start, Pause, Resume and Reset, and a chime and "Time's up" (announced to screen readers) when it ends. It's kept in the widget's state as when it ends, or what was left when paused (`read_timer`, `save_timer`), so it carries on across pages and reloads. Compact shows the clock with its buttons in a row.
- **Countdowns pick units that fit** (`pick_countdown_units`): days, hours and minutes a day or more away; hours, minutes and seconds within a day; minutes and seconds within an hour, ticking every second within a day. Compact shows a clock ("29:55") within a day. The end reads "Today at 3:30 PM" or "Tomorrow at 9:00 AM" when it's close (`describe_countdown_end`).
- **Common sense in the prompt.** `COMMON_SENSE_RULES` comes first in the assistant's rules: picture the result before acting; pick the reading most people mean; fill sensible defaults instead of asking; a duration is a length of time, not a date; match the scale; keep it in proportion; relative changes ("a bit more see-through") start from the current value; check tool results against the request. The widget guide has a **which kind fits** list with worked examples ("make me a 30 minute countdown" becomes a timer of 1800 seconds). A new widget shows on the page the student is on unless they say where (`default_pinned_paths`), and the overview shows each widget's pages and its glass or tint values (`describe_widget_line`), so "more see-through" lowers the current opacity.
- **Apps that would not even run are turned down.** `find_script_error` compiles each of an app's scripts with Node's parser (without running them) and sends a syntax error back to the app builder. In testing, Gemini once wrote a calculator whose keyboard regular expression was invalid, which stopped its whole script.

Checked live with the default assistant (Gemini Flash-Lite), each from the page named:

| Asked | What it made |
| --- | --- |
| "make me a 30 minute countdown" (Learn) | A timer, 1800 seconds, on Learn |
| "countdown to my history essay deadline on friday at 5pm" (Schedule) | A countdown to Friday 17:00, on Schedule |
| "a pomodoro timer please" | A 25 minute timer |
| "put a calculator on every page" | A calculator app on every page |
| "make me a to-do list for revising for my biology test" | Five specific steps (cells, mitosis and meiosis, genetics…) |
| "hide the 30 minute timer" | Hidden, not deleted |
| "show the essay countdown on the learn and schedule pages" | Pinned to both |
| "make the essay countdown glass and a bit more see-through" | Glass, opacity 25 → 15 |

## Polish and keeping in sync (Phase 11)

Phase 11 is the small things: what's on screen is never out of date, the AI always knows which subject a topic belongs to, and the design is consistent in light and dark.

### Keeping everything in step

```
any save (send_authed_request with a method other than GET)
   └─ announce_data_change()  ── several saves within 50 ms become one
        ├─ notify_data_changed() in this tab ──▶ every use_api_data refreshes quietly
        │                                       AuthProvider reloads the account
        └─ BroadcastChannel "studyapp-sync" ──▶ the same in every other open tab
coming back to the tab after 30 s or more away ──▶ notify_data_changed()
a 401 from the server ──▶ SESSION_ENDED_EVENT ──▶ signed out, login page says why
```

- **Quiet refreshes.** A refresh keeps what's on screen until the new copy arrives (no "Loading…" flash), and a refresh that fails keeps it too. Views of one activity in progress (a guided lesson, a practice set, a lesson with Pip, a reading guide, a running work block) pass `live: false`, so a change elsewhere can't restart them or ask the AI again.
- **The account follows along.** The assistant renaming the student, or another tab changing the focus timer, updates the sidebar and the timer straight away.
- **Other tabs.** Logging out in one tab logs out the others ("You logged out in another tab."), and logging in in one tab signs the others in.
- **A session that ends** (expired, or logged out on another device) sends the student to the login page with "Your session ended. Log in again to carry on where you were.", and back to the same page and skill afterwards.
- **The chosen skill is remembered** on the device: picking Spanish on the skill map opens Learn, Quiz and Teach on Spanish too. A `?skill=` in the address still wins.

### The AI knows the subject

A topic name can mean different things in different subjects. Before Phase 11, a quiz on "Maritime technologies" in an AP World History unit was sent to the AI as just "Maritime technologies", and it asked about modern shipping. Now every AI request about a topic carries:

- `skill_name`: the skill, such as "AP World Unit 4".
- `topic_path`: the topic with the topics above it on the skill map, such as "Maritime empires > Maritime technologies" (`format_topic_path` in [topic_service.js](server/services/topic_service.js)).
- `SUBJECT_RULE` in the system prompt ([ai_prompts.js](server/services/ai/ai_prompts.js)): read the topic as this subject teaches it, at its period, field and level.

This covers notes, quizzes, subtopics, guided lessons and re-teaching, practice and its answer checks, reading guides, "explain another way", the learning path, key terms, and Pip in "Teach the AI student". The assistant uses the same services, so its quizzes and notes get it too. Checked with Gemini: the same quiz now asks about the lateen sail, the astrolabe, the Dutch fluyt and how these technologies spread between cultures from 1450 to 1750.

### Design

- **Dark mode.** Settings → Appearance: Match my device (the default), Light or Dark, saved on the device and followed by other open tabs. Every color is a token, so the dark set in [theme.css](client/src/styles/theme.css) switches the whole app, AI-made app widgets included. A small script in [index.html](client/index.html) sets the theme before the page draws, so it never flashes light. Checked with axe in both themes on every page.
- **"Are you sure?" popups** match the app instead of the browser's grey box. Cancel has focus first, so Enter never deletes by accident. Ending a work block early and finishing a quiz with skipped questions ask the same way ("Keep going" / "Finish anyway").
- **One page width.** Every dashboard page, the reminder and pinned widgets line up in one centered column.
- **Phones.** The Learn tabs scroll sideways instead of wrapping, and the learning style reminder is smaller, with **Not now** to hide it on that device (Settings still offers the quiz).
- **Small touches.**
  - **Ctrl+K** (Cmd+K on a Mac) opens and closes the assistant from any dashboard page.
  - App widgets get the app's design kit (see [Finished widgets](#finished-widgets-glass-the-app-kit-and-better-ai-widgets)) and grow or shrink to fit their content.
  - The focus chart says how to add focus time instead of drawing an empty chart.
  - The practice mode note is one line, with the details folded away.
  - Progress tiles line up at the same height.
  - The homepage shows signed-in students "Go to your dashboard" instead of sign-up buttons, and lists the newer features (step-by-step learning, the assistant).

---

## Folder structure

```
.
├── assets/                 All images, icons, audio and video used by the app (served at the site root)
│   ├── icons/logo.svg
│   └── images/skill-map-preview.svg   Homepage illustration
├── client/                 React + Vite + Tailwind website
│   ├── index.html          HTML shell: fonts, favicon, #root
│   ├── vite.config.js      Vite, Tailwind and Vitest config
│   ├── vercel.json         Vercel build and the single-page-app rewrite
│   ├── .env.example
│   ├── src/
│   │   ├── main.jsx        Mounts <App /> and loads the theme CSS
│   │   ├── App.jsx         AuthProvider + router
│   │   ├── config/         constants.js (incl. ROUTE_PATHS), dashboard_pages.js, resource_types.js, mastery.js
│   │   ├── context/        AuthContext.jsx (who is logged in), AssistantContext.jsx (the panel and widgets),
│   │   │                   ThemeContext.jsx (light or dark), ConfirmContext.jsx ("Are you sure?" popups)
│   │   ├── routes/         app_routes.jsx: the site map
│   │   ├── layouts/        RootLayout, PublicLayout, DashboardLayout
│   │   ├── pages/          One file per page; dashboard/ for dashboard pages
│   │   ├── components/     Shared pieces: forms, dialogs, panels, navigation, guards, loading screen
│   │   │   ├── topic_map/  Skill map: TopicMapSection, SkillOverview, TopicMap, TopicNode, TopicOutline, TopicPanel, TopicDialog,
│   │   │   │               TopicDetails, TopicSubtopics, TopicResources, TopicEditor, StudyNextPanel, MasteryLegend, TopicManager
│   │   │   ├── learn/      Learn page: LearnTabs, LearningPathPanel, LessonsPanel, GuidedLessonView, PracticePanel, PracticeView,
│   │   │   │               ReadingList, ReadingView, GlossaryPanel, TopicKeyTerms, ExplainAnotherWay, LearnTopicForm, SavedActivityList
│   │   │   ├── teach/      TeachSetup, LessonHistory, TeachLesson, TeachQuiz, TeachResults, ScoreCard, AiStudentResults
│   │   │   ├── assistant/  AssistantLauncher, AssistantPanel, AssistantChat, AssistantActions
│   │   │   ├── widgets/    WidgetShelf, FloatingWidgets, WidgetWindow, WidgetMenu, WidgetControls, WidgetHandles,
│   │   │   │               StackView, WidgetView, WidgetBlocks (each block lays itself out for the widget's shape),
│   │   │   │               GlassRefraction (the glass edges)
│   │   │   ├── chat/       ChatThread, ChatComposer (the lesson and the assistant use them)
│   │   │   ├── quiz/       QuizWorkspace, QuizSetup, QuizRunner, QuizResults, RecentResults
│   │   │   ├── schedule/   WeekCalendar, EventCard, EventDialog, PlanWeekDialog, SubjectColorsPanel
│   │   │   ├── settings/   AccountForm, account_updates.js, AppearanceSettings, LearningProfileSettings, DeleteAccountSection
│   │   │   ├── progress/   StatTile, StudyTimeChart, SkillProgressList, TopicChanges
│   │   │   └── work_block/ WorkBlockTimer
│   │   ├── hooks/          use_api_data, use_page_transition, use_focus_on_navigation, use_escape_key, use_now, use_speech_input, use_media_query, use_remembered_skill,
│   │   │                   use_widget_actions, use_pointer_drag, use_viewport_size
│   │   ├── services/       One file per API area (auth, account, skills, resources, notes/quizzes, topics, schedule, teach, progress, learning, assistant, widgets)
│   │   ├── utils/          format, dates, topic_map_layout, topic_tree, study_paths, skill_selection, study_planner, work_block_timer, chime, progress, widgets, data_events, device_storage, theme
│   │   └── styles/theme.css  Style guide as Tailwind theme tokens
│   └── tests/              Mirrors src/ (components/, pages/, ...), plus helpers/
├── server/                 Express REST API
│   ├── index.js            Entry point: read env, start server
│   ├── server.js           Opens the database and listens
│   ├── app.js              Builds the Express app and mounts routes
│   ├── config/             constants.js, env.js, learning_quiz.js, resource_types.js, media_types.js, chat_assistants.js
│   ├── db/                 database.js (opens SQLite), schema.sql (every table), migrations.js (columns added later)
│   ├── middleware/         require_auth.js, handle_errors.js, receive_upload.js
│   ├── routes/             One router per area (health, auth, account, learning quiz, skills, resources, notes, quizzes, topics, teach, assistant, widgets, guided lessons, practice, reading, learning path / key terms / explain, events, work blocks, progress, ai)
│   ├── services/           Business logic and database access
│   │   ├── extraction/     Getting text out of PDFs, files, articles and YouTube; safe_fetch
│   │   ├── assistant/      The assistant: its service, context, validators, tool registry and tools (study, learning, planning, widgets)
│   │   └── ai/             AI providers, the AI choice (chat_assistants), prompts (learning_prompts, assistant_prompts), output checks, source selection, the mock AI, mock AI student, mock learning and mock assistant
│   ├── tests/              One test file per source file, plus helpers/
│   ├── data/               Created at runtime: studyapp.db and uploads/ (git-ignored)
│   └── .env.example
├── package.json            Root scripts: install:all, dev, test, test:coverage
├── render.yaml             Render Blueprint for the API (see Deployment)
├── .nvmrc                  Node version (24)
└── .gitignore
```

---

## Server reference

### API routes

All routes start with `/api`. Errors always come back as JSON: `{ "error": "message" }`, plus `field_errors` (field name → message) for form problems.

| Method | Path | Auth | Body / query | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/health` | No | | `200 { status: "ok" }` | |
| GET | `/auth/check-username` | No | `?username=` | `200 { is_available }` | 400 invalid username |
| POST | `/auth/signup` | No | `{ username, password, email, first_name, last_name }` | `201 { token, account }` | 400 field_errors, 409 username/email taken (with field_errors) |
| POST | `/auth/login` | No | `{ email, password }` | `200 { token, account }` | 400 field_errors, 401 wrong email or password |
| POST | `/auth/logout` | Yes | | `204` | 401 |
| GET | `/learning-quiz` | No | | `200 { questions }` | |
| GET | `/account` | Yes | | `200` account | 401 |
| PUT | `/account/learning-profile` | Yes | `{ answers: { question_id: answer } }` | `200` updated account | 400 field_errors (keyed by question id), 401 |
| PATCH | `/account` | Yes | any of `username, password, email, first_name, last_name, work_minutes, break_minutes`; plus `current_password` when changing `email` or `password` | `200` updated account. A new password logs out every other session | 400 field_errors (incl. `current_password` missing or wrong), 401, 409 |
| DELETE | `/account` | Yes | `{ password }` | `204` (with every session, file and row of theirs) | 400 field_errors.password (missing or wrong), 401 |
| GET | `/progress` | Yes | | `200` progress (see `get_progress` in [progress_service.js](server/services/progress_service.js)) | 401 |
| GET | `/skills` | Yes | | `200 [skill]` | 401 |
| POST | `/skills` | Yes | `{ name, color? }` | `201` skill | 400, 409 duplicate name |
| PATCH | `/skills/:skill_id` | Yes | `{ name?, color? }` | `200` skill | 400, 404, 409 |
| DELETE | `/skills/:skill_id` | Yes | | `204` (with all its resources, notes, quizzes and files) | 404 |
| GET | `/skills/:skill_id/resources` | Yes | | `200 [resource summary]` | 404 |
| POST | `/skills/:skill_id/resources/files` | Yes | multipart: `file`, `title?`, `topic_id?` | `201` resource + `is_truncated` | 400 unsupported type or topic from another skill, 404 topic, 413 over 25 MB, 422 no readable text |
| POST | `/skills/:skill_id/resources/links` | Yes | `{ url, title?, topic_id? }` | `201` resource + `is_truncated` | 400 bad or private link, 422 page or captions unreadable |
| POST | `/skills/:skill_id/resources/text` | Yes | `{ title, text, topic_id? }` | `201` resource + `is_truncated` | 400 |
| GET | `/resources/:resource_id` | Yes | | `200` resource with `extracted_text` | 404 |
| PATCH | `/resources/:resource_id` | Yes | `{ topic_id }` (an id, or `null` for no topic) | `200` resource summary | 400, 404 |
| DELETE | `/resources/:resource_id` | Yes | | `204` | 404 |
| GET | `/skills/:skill_id/notes` | Yes | | `200 [note]`, newest first | 404 |
| POST | `/skills/:skill_id/notes` | Yes | `{ topic }` | `201` note | 400, 422 practice mode with no resources, 502/503 AI problem |
| DELETE | `/notes/:note_id` | Yes | | `204` | 404 |
| GET | `/skills/:skill_id/quizzes` | Yes | | `200 [{ id, topic_id, scope, resource_id, topic, question_count, created_at }]` | 404 |
| POST | `/skills/:skill_id/quizzes` | Yes | `{ scope?, topic?, topic_id?, resource_id?, question_count? }` (see [quiz scopes](#topics-and-quiz-scopes-phase-6); 3–15 questions, default 5) | `201` quiz without answers | 400, 404 topic or resource, 422 practice mode with too little text, 502/503 |
| GET | `/quizzes/:quiz_id` | Yes | | `200` quiz without answers | 404 |
| DELETE | `/quizzes/:quiz_id` | Yes | | `204` | 404 |
| GET | `/ai/status` | Yes | | `200 { ai_provider, transcription_provider }` | 401 |
| GET | `/assistant` | Yes | | `200 { messages, assistant_id, assistants: [{ id, label, description }] }` (messages oldest first, last 200) | 401 |
| POST | `/assistant/messages` | Yes | `{ message, page?, utc_offset_minutes? }` (up to 4,000 characters; page is the current address) | `201 { user_message, assistant_message, client_actions: [{ type: "navigate", path }], data_changed }` | 400 field_errors, 502/503 when the AI fails before doing anything |
| DELETE | `/assistant/messages` | Yes | | `204` | 401 |
| PUT | `/assistant/settings` | Yes | `{ assistant_id }` | `200 { assistant_id }` | 400 not on offer |
| POST | `/assistant/messages/:message_id/actions/:action_id/confirm` | Yes | | `200 { message, client_actions, data_changed }` | 404, 409 already answered |
| POST | `/assistant/messages/:message_id/actions/:action_id/cancel` | Yes | | `200 { message }` | 404, 409 |
| GET | `/widgets` | Yes | | `200 [widget]`, newest first | 401 |
| GET | `/widgets/live/:source` | Yes | `?skill_id=` (optional) | `200 { source, items: [{ label, detail, starts_at?, link? }] }` | 400 unknown source, 404 skill |
| PUT | `/widgets/order` | Yes | `{ items: [{ type: "widget" \| "stack", id }] }` in their new order | `204`, each item's `layout.position` set to its index (all or nothing) | 400, 404 |
| GET | `/widget-stacks` | Yes | | `200 [stack]`: `{ id, widget_ids, view, active_widget_id, pinned_paths, layout }` | 401 |
| POST | `/widget-stacks` | Yes | `{ widget_ids (2–10), view?, pinned_paths?, layout? }` | `201` stack | 400, 404, 409 (already stacked, or 20 stacks) |
| PATCH | `/widget-stacks/:stack_id` | Yes | any of `{ widget_ids, view, active_widget_id, pinned_paths, layout }` | `200 { stack }`, `null` when one widget was left and it came apart | 400, 404, 409 |
| DELETE | `/widget-stacks/:stack_id` | Yes | | `204`; the widgets are kept and show where the stack was | 404 |
| PATCH | `/widgets/:widget_id` | Yes | any of `{ title, state, pinned_paths, layout }`: `pinned_paths` is `[]`, `["*"]` or a list of `/dashboard/<page>`; `layout` is merged (any of `DEFAULT_WIDGET_LAYOUT`'s settings: size and place, look, `is_hidden`) | `200` widget | 400, 404 |
| DELETE | `/widgets/:widget_id` | Yes | | `204` | 404 |
| GET | `/skills/:skill_id/teach-sessions` | Yes | | `200 [lesson summary]`, newest first | 404 |
| POST | `/skills/:skill_id/teach-sessions` | Yes | `{ topic_id }` or `{ topic }` | `201` teach session | 400, 404 topic |
| GET | `/teach-sessions` | Yes | | `200 [lesson summary]` from every skill, newest first (last 20) | 401 |
| GET | `/teach-sessions/:session_id` | Yes | | `200` teach session | 404 |
| POST | `/teach-sessions/:session_id/messages` | Yes | `{ message }` (up to 4,000 characters) | `200` teach session with Pip's reply | 400 empty or 15 already, 404, 409 lesson over, 502/503 |
| POST | `/teach-sessions/:session_id/quiz` | Yes | `{ question_count? }` (3–10, default 5) | `200` teach session with its `quiz` | 400 nothing taught yet, 404, 409 already has a quiz, 422/502/503 |
| POST | `/teach-sessions/:session_id/results` | Yes | `{ answers: [index or null] }` | `201 { teach_session (with results), topic }` | 400 field_errors.answers, 404, 409 no quiz waiting |
| DELETE | `/teach-sessions/:session_id` | Yes | | `204` (with its quiz and results) | 404 |
| GET | `/skills/:skill_id/learning-path` | Yes | | `200` learning path | 404 |
| POST | `/skills/:skill_id/learning-path` | Yes | | `200` the new path (topics found first if the skill has none) | 404, 422/502/503 |
| GET | `/skills/:skill_id/guided-lessons` | Yes | | `200 [guided lesson summary]`, newest first (last 20) | 404 |
| POST | `/skills/:skill_id/guided-lessons` | Yes | `{ topic_id? | topic, step_count? }` (3–6, default 4) | `201` guided lesson | 400, 404 topic, 422/502/503 |
| GET | `/guided-lessons/:lesson_id` | Yes | | `200` guided lesson | 404 |
| POST | `/guided-lessons/:lesson_id/answer` | Yes | `{ choice_index }` (0–3) | `200` lesson with that check's answer shown | 400, 404, 409 already answered or lesson finished |
| POST | `/guided-lessons/:lesson_id/reteach` | Yes | | `200` lesson with the step explained again and a new check | 404, 409 nothing to explain again, 422/502/503 |
| POST | `/guided-lessons/:lesson_id/next` | Yes | | `200` lesson on its next step, or complete | 404, 409 not answered yet or finished |
| DELETE | `/guided-lessons/:lesson_id` | Yes | | `204` | 404 |
| GET | `/skills/:skill_id/practice-sets` | Yes | | `200 [practice summary]`, newest first (last 20) | 404 |
| POST | `/skills/:skill_id/practice-sets` | Yes | `{ topic_id? | topic, problem_count? }` (1–5, default 3) | `201` practice set | 400, 404 topic, 422/502/503 |
| GET | `/practice-sets/:practice_id` | Yes | | `200` practice set | 404 |
| POST | `/practice-sets/:practice_id/problems/:problem_index/hint` | Yes | | `200` practice set with one more hint shown | 404, 409 no hints left |
| POST | `/practice-sets/:practice_id/problems/:problem_index/solution` | Yes | | `200` practice set with the solution shown | 404 |
| POST | `/practice-sets/:practice_id/problems/:problem_index/check` | Yes | `{ answer }` (up to 2,000 characters) | `200 { practice_set, attempt: { answer, is_correct, feedback } }` | 400, 404, 409 already solved, 502/503 |
| DELETE | `/practice-sets/:practice_id` | Yes | | `204` | 404 |
| GET | `/skills/:skill_id/reading` | Yes | | `200 [{ resource_id, title, resource_type, topic_id, section_count, position }]` | 404 |
| GET | `/resources/:resource_id/reading` | Yes | | `200 { resource, sections: [{ index, title, character_count, has_guide }], position }` | 404 |
| GET | `/resources/:resource_id/reading/sections/:section_index` | Yes | | `200 { index, title, text, guide }` (`guide` is `null` until made) | 404 |
| POST | `/resources/:resource_id/reading/sections/:section_index/guide` | Yes | | `200` the section with `guide: { explanation_markdown, think_about }` (made once, then kept) | 404, 502/503 |
| PUT | `/resources/:resource_id/reading/position` | Yes | `{ section_index }` | `200 { position }` | 404 |
| POST | `/resources/:resource_id/reading/explain` | Yes | `{ passage, section_index }` (up to 2,000 characters) | `200 { explanation_markdown }` | 400, 404, 502/503 |
| GET | `/skills/:skill_id/glossary` | Yes | | `200 [term]`, alphabetical | 404 |
| POST | `/skills/:skill_id/glossary` | Yes | `{ term, definition, topic_id? }` | `201` term | 400, 404 topic, 409 term already there or 300 terms reached |
| POST | `/skills/:skill_id/glossary/generate` | Yes | | `200 { added_count, terms }` | 404, 409 full, 422/502/503 |
| DELETE | `/skills/:skill_id/glossary/:term_id` | Yes | | `204` | 404 |
| POST | `/skills/:skill_id/explain` | Yes | `{ text, style, topic_id? }` (`simpler`, `analogy`, `example`, `deeper` or `plain`; up to 6,000 characters) | `200 { explanation_markdown }` | 400, 404 topic, 502/503 |
| POST | `/quizzes/:quiz_id/check` | Yes | `{ question_index, answer_index }` | `200 { is_correct, correct_index, explanation }` | 400, 404 |
| POST | `/quizzes/:quiz_id/results` | Yes | `{ answers: [index or null] }` | `201 { result, question_results, topic }` | 400 field_errors.answers, 404 |
| GET | `/skills/:skill_id/results` | Yes | | `200 [recent result]` | 404 |
| GET | `/events` | Yes | `?from=<iso>&to=<iso>` (at most 62 days) | `200 [event]` | 400 |
| POST | `/events` | Yes | `{ title, starts_at, ends_at, details?, skill_id? }` | `201` event | 400 field_errors, 404 skill |
| GET | `/events/:event_id` | Yes | | `200` event | 404 |
| PATCH | `/events/:event_id` | Yes | any of the fields above | `200` event | 400, 404 |
| DELETE | `/events/:event_id` | Yes | | `204` | 404 |
| POST | `/work-blocks` | Yes | `{ activity, event_id?, skill_id?, planned_minutes? }` | `201` work block | 400, 404 |
| GET | `/work-blocks/active` | Yes | | `200 { work_block }` (`null` when none) | 401 |
| POST | `/work-blocks/:work_block_id/finish` | Yes | `{ completed_minutes?, activity? }` | `200` work block | 400, 404, 409 already ended |

"Auth: Yes" means the request needs `Authorization: Bearer <token>`. Another student's skill, resource, note or quiz always returns 404, exactly like a missing one.

Shapes:
- **Skill:** `{ id, name, color, created_at, resource_count, topic_count, weak_topic_count, untested_topic_count }`
- **Resource summary:** `{ id, skill_id, topic_id, title, resource_type, source_url, status, created_at, character_count }`
  - `topic_id` is the map topic it's filed under, or `null`.
  - `resource_type` is `pdf`, `note`, `audio`, `video`, `article` or `youtube`.
- **Note:** `{ id, skill_id, skill_node_id, topic, content (Markdown), created_at }`
- **Quiz:** `{ id, skill_id, topic_id, scope, resource_id, topic, created_at, questions: [{ question, choices }] }`
  - `scope` is `skill`, `topic` or `resource`; `topic` is the name shown, e.g. "All of Biology" or the resource's title.
  - `correct_index` and `explanation` stay on the server until the quiz is graded (or checked one question at a time).
- **Topic:** `{ id, skill_id, parent_node_id, topic, summary, mastery_score (0–100 or null), mastery_level, resource_count, created_at }`
  - `resource_count` counts resources filed directly under the topic.
- **Suggestion:** `{ topic_id, topic, mastery_level, reason }`
- **Event:** `{ id, skill_id, skill_name, skill_color, title, details, starts_at, ends_at, created_at }`
- **Work block:** `{ id, event_id, event_title, skill_id, skill_name, activity, planned_minutes, break_minutes, completed_minutes, started_at, ended_at }`
- **Assistant message:** `{ id, role ("user" | "assistant"), content (Markdown for the assistant), actions: [{ id, tool, label, status ("done" | "failed" | "pending" | "cancelled"), summary, link, widget_id }], created_at }`.
- **Widget:** `{ id, title, kind ("card" | "app"), spec, state, pinned_paths, layout, created_at, updated_at }`. A card's spec is `{ blocks }`, an app's `{ html, height }`.
- **Teach session:** `{ id, skill_id, topic_id, topic, status ("teaching" | "quiz" | "done"), lesson_messages: [{ role: "teacher" | "ai_student", content }], teacher_message_count, max_teacher_messages, created_at, quiz, results }`
  - `quiz` (without answers) is set only while `status` is `quiz`.
  - `results` is set only when `done`: `{ combined_score, student: { score, correct_count, total_count }, ai_student: { ... }, teaching_feedback, review: [{ question, choices, correct_index, explanation, student_choice, student_is_correct, ai_student_choice, ai_student_is_correct, ai_student_reason }] }`.
- **Lesson summary:** `{ id, skill_id, skill_name, topic, status, combined_score, student_score, ai_student_score, created_at }`
- **Guided lesson:** `{ id, skill_id, topic_id, topic, step_count, current_step, is_complete, completed_at, created_at, steps, can_reteach, first_try_correct }`
  - `steps` holds the steps up to `current_step` only: `[{ title, explanation_markdown, example_markdown, checks }]`. Each check is `{ reteach_markdown (null for the first), question, choices, chosen_index }`, plus `correct_index`, `explanation` and `is_correct` once answered.
  - `first_try_correct` is set once the lesson is complete. Summaries: `{ id, topic_id, topic, step_count, current_step, is_complete, created_at }`.
- **Learning path:** `{ has_path, created_at, steps, new_topic_count, topic_count }`, each step `{ topic_id, topic, summary, parent_topic, reason, is_new, mastery_level, lesson: { latest_lesson_id, is_latest_complete, has_finished } | null, status: "done" | "next" | "todo" }`.
- **Practice set:** `{ id, skill_id, topic_id, topic, created_at, worked_example: { problem, steps, answer }, problems, solved_count }`, each problem `{ problem, hints (shown so far), hint_count, attempts: [{ answer, is_correct, feedback }], is_solved, is_solution_shown, solution_steps, answer }` (the last two `null` until shown). Summaries: `{ id, topic_id, topic, problem_count, solved_count, created_at }`.
- **Key term:** `{ id, skill_id, topic_id, term, definition, created_at }`.
- **Skill** also carries `topic_count`, `weak_topic_count` and `untested_topic_count`, which the week planner uses.

Account shape: `{ id, email, username, first_name, last_name, learning_profile, work_minutes, break_minutes, created_at }`. The password hash is never sent.

### Files and functions

**[server/index.js](server/index.js)**: entry point for `npm start` and `npm run dev`. Calls `start_server(read_env())`. Contains no logic.

**[server/server.js](server/server.js)**
- `start_server(env)`: builds the AI provider, the transcriber and the chat assistants from `env.ai`, opens the database with `open_database`, builds the app with `create_app`, and listens on `env.port`. The startup log names the database and providers. Returns the `http.Server`.

**[server/app.js](server/app.js)**
- `create_app({ database, uploads_path, client_origin, ai_provider, transcriber, chat_assistants })`: builds the Express app and the `resource_importer`. `chat_assistants` defaults to practice mode only, which is what most tests use.
  - Order matters: CORS → JSON body parser → routers → `handle_not_found` → `handle_errors`.
  - Everything except `/health`, `/auth/*` (apart from logout) and `/learning-quiz` sits behind `require_auth`.
  - Each router is mounted on its own prefix (`/api/skills`, `/api/resources`, ...), so an unknown path still gives a 404 rather than a 401.

**[server/config/constants.js](server/config/constants.js)**: every fixed value: default port, origin and data paths, `HTTP_STATUS`, username/password/name limits, `EMAIL_PATTERN`, password hashing sizes, session token size and lifetime, the timer limits (`WORK_MINUTES`, `BREAK_MINUTES`), the learning limits (`LESSON_STEP_COUNT`, `MAX_LESSON_RETEACHES`, `PRACTICE_PROBLEM_COUNT`, `MAX_PRACTICE_HINTS`, `READING_SECTION_CHARACTERS`, `EXPLAIN_STYLES`, the glossary limits) and the Progress page periods (`QUIZ_SCORE_PERIOD_DAYS` 30, `STUDY_TIME_PERIOD_DAYS` 7, `STUDY_TIME_CHART_DAYS` 14, `MAX_TOPIC_CHANGES` 5). The widget layout values are `WIDGET_WIDTHS`, `WIDGET_MODES`, `WIDGET_ANCHORS`, `WIDGET_APPEARANCES`, `WIDGET_ACCENTS`, `WIDGET_CONTENT_SIZES`, `DEFAULT_WIDGET_LAYOUT`, `WIDGET_CONTENT_HEIGHT`, `WIDGET_FLOAT_WIDTH`, `WIDGET_FLOAT_HEIGHT` and `WIDGET_FLOAT_OFFSET`; stacks use `WIDGET_STACK_VIEWS`, `MAX_STACK_WIDGETS` and `MAX_WIDGET_STACKS`; and `TOPIC_PATH_SEPARATOR` joins a topic's place on the map. Validation limits must match the `CHECK` constraints in `schema.sql`.

**[server/config/learning_quiz.js](server/config/learning_quiz.js)**: `LEARNING_QUIZ_QUESTIONS`, the learning style and goals quiz. Each question has an `id`, a `type` (`single`, `multiple` or `text`), a `prompt`, and either `options` (`{ value, label }`) or `max_length`. Multiple-choice questions also have `min_choices` and `max_choices`. Each `session_length` option carries `work_minutes` and `break_minutes`, which set the work block timer. To add a question, add it here; the form and the validation pick it up automatically.

**[server/config/resource_types.js](server/config/resource_types.js)**:
- `RESOURCE_TYPE_BY_EXTENSION`: which uploads are accepted and what each one becomes.
- `SUPPORTED_EXTENSIONS`.
- `NO_TEXT_MESSAGES`: one per resource type, used when nothing readable was found.

The client keeps a matching list in `client/src/config/resource_types.js`.

**[server/config/media_types.js](server/config/media_types.js)**: `MEDIA_TYPE_BY_EXTENSION`, the media type Gemini is told for each audio and video upload (for example `.mp3` → `audio/mp3`).

**[server/config/env.js](server/config/env.js)**
- `read_env(source_env = process.env)`: returns `{ port, client_origin (a list), database_path, uploads_path, ai: { provider, transcription_provider, gemini_api_key, gemini_api_keys (the main key and `GEMINI_BACKUP_API_KEYS`), gemini_models: { light, standard, transcription }, anthropic_api_key, anthropic_model, openai_api_key, openai_model } }`. Every value has a default.
- `read_key_list(main_key, backup_keys_text)`: every key for one provider, main key first, without blanks or repeats.
- `parse_origin_list(origin_text)`: `CLIENT_ORIGIN` can list several sites, comma-separated (for example the Vercel address and `http://localhost:5173`). Trims each and drops blanks.
- `build_model_chain(first_choice, default_chain)`: puts a model chosen in `.env` at the front of a default list, without repeats.
- `read_choice(variable_name, value, allowed_names)`: makes the server stop at startup with a clear message when `AI_PROVIDER` or `TRANSCRIPTION_PROVIDER` is misspelled.

**[server/db/database.js](server/db/database.js)**
- `open_database(database_path)`: creates the folder if needed, opens the SQLite file (or `':memory:'`), turns on `PRAGMA foreign_keys` (**without this, cascading deletes silently do nothing**), runs `schema.sql`, then `add_missing_columns`.

**[server/db/migrations.js](server/db/migrations.js)**
- `ADDED_COLUMNS` (Phase 7 added `teach_sessions.ai_student_reasons` and `teaching_feedback`): `{ table_name, column_name, definition }` for every column added after a table first shipped. **When you add a column to an existing table in `schema.sql`, add it here too**, with the same definition.
- `add_missing_columns(database, added_columns)`: runs `ALTER TABLE … ADD COLUMN` for each one the table lacks. Safe to run every start.
- `move_pinned_paths(database)`: moves older files' one-page `pinned_path` into the `pinned_paths` list, once.
- `list_column_names(database, table_name)`.

**[server/config/chat_assistants.js](server/config/chat_assistants.js)**: `CHAT_ASSISTANTS`, the AIs that can run the assistant: `{ id, provider, task_tier, label, description }`. `gemini-quick` (Flash-Lite), `gemini-thorough` (Flash), `claude`, `chatgpt` and `practice`.

**[server/db/schema.sql](server/db/schema.sql)**: every table, index and trigger. See [Database](#database).

**[server/middleware/require_auth.js](server/middleware/require_auth.js)**
- `extract_bearer_token(authorization_header)`: returns the token from `Bearer <token>`, or `null`.
- `create_require_auth(database)`: returns middleware that looks up the token with `find_session_user_id` and sets `req.user_id` and `req.session_token`, or responds 401.

**[server/middleware/handle_errors.js](server/middleware/handle_errors.js)**
- `handle_not_found(req, res)`: 404 JSON for unknown routes.
- `handle_errors(error, req, res, next)`: decides what the student sees.
  - Errors made with `create_http_error` (any status) are sent with their message and `extra_body`.
  - Other 4xx errors, such as invalid JSON, keep their status and message.
  - Anything else becomes a generic 500.
  - Every 5xx is logged with `console.error`, using the error's `cause` when there is one, so an AI provider's real error shows in the server terminal. **When debugging a 5xx, look at the server terminal.**

**[server/middleware/receive_upload.js](server/middleware/receive_upload.js)**
- `receive_upload(req, res, next)`: multer middleware for one file in the `file` field. It keeps the file in memory (up to 25 MB) and keeps non-English file names intact. Sets `req.file`.
- `to_upload_error(multer_error)`: too large → 413 with the limit; anything else → 400.

**[server/routes/health_routes.js](server/routes/health_routes.js)**
- `create_health_router()`: `GET /` → `report_health`.

**[server/routes/auth_routes.js](server/routes/auth_routes.js)**
- `create_auth_router(database, require_auth)`:
  - `check_username` → `validate_username`, `is_username_taken`
  - `sign_up` → `validate_signup_input`, `create_account`, `create_session`
  - `log_in` → `validate_login_input`, `authenticate`, `create_session`
  - `log_out` → `delete_session`

**[server/routes/account_routes.js](server/routes/account_routes.js)**
- `create_account_router(database, uploads_path)`:
  - `read_account` → `get_account`.
  - `edit_account` → `validate_account_updates`; `assert_password_matches` on `current_password` when the email or password changes; `update_account`; then `delete_other_sessions` after a new password.
  - `replace_learning_profile` → `validate_learning_profile`, `save_learning_profile`.
  - `remove_account` → `validate_delete_confirmation`, `assert_password_matches` on `password`, `delete_account`.

**[server/routes/guided_lesson_routes.js](server/routes/guided_lesson_routes.js)**
- `create_skill_guided_lesson_router({ database, ai_provider })`: `read_skill_guided_lessons`, `begin_guided_lesson` → `validate_lesson_input`, `start_guided_lesson`.
- `create_guided_lesson_router({ database, ai_provider })`: `read_guided_lesson`, `answer_check` → `validate_choice_index`, `answer_lesson_check`; `explain_step_again` → `reteach_current_step`; `go_to_next_step` → `advance_guided_lesson`; `remove_guided_lesson`.

**[server/routes/practice_routes.js](server/routes/practice_routes.js)**
- `create_skill_practice_router`: `read_skill_practice_sets`, `make_practice_set` → `validate_practice_input`, `create_practice_set`.
- `create_practice_set_router`: `read_practice_set`, `show_hint` → `reveal_hint`, `show_solution` → `reveal_solution`, `check_answer` → `validate_practice_answer`, `check_practice_answer`, `remove_practice_set`. `read_target(req)` gathers the practice row and problem index.

**[server/routes/reading_routes.js](server/routes/reading_routes.js)**
- `create_skill_reading_router({ database })`: `read_reading_list` → `list_reading_resources`.
- `create_resource_reading_router({ database, ai_provider })` (mounted by `create_resource_router` at `/:resource_id/reading`, with `mergeParams`): `read_reading_overview`, `read_section`, `guide_section`, `remember_position`, `explain_passage` → `validate_passage`, `explain_reading_passage`.

**[server/routes/learning_routes.js](server/routes/learning_routes.js)**: mounted inside the skill router.
- `create_learning_path_router`: `read_learning_path`, `make_learning_path` → `build_learning_path`.
- `create_glossary_router`: `read_glossary`, `add_term` → `validate_glossary_term_input`, `add_glossary_term`; `find_key_terms` → `generate_glossary_terms`; `remove_term`.
- `create_explain_router`: `explain_differently` → `validate_explain_input`, `explain_another_way`.

**[server/routes/progress_routes.js](server/routes/progress_routes.js)**
- `create_progress_router({ database })`: `read_progress` (`GET /`) → `get_progress`.

**[server/routes/learning_quiz_routes.js](server/routes/learning_quiz_routes.js)**
- `create_learning_quiz_router()`: `GET /` → `read_learning_quiz`, which returns `LEARNING_QUIZ_QUESTIONS`.

**[server/routes/skill_routes.js](server/routes/skill_routes.js)**
- `create_skill_router({ database, uploads_path, ai_provider, resource_importer })`:
  - `read_skills`, `add_skill`, `edit_skill`, `remove_skill`.
  - `load_owned_skill` runs before every `/:skill_id` path. It sets `req.skill`, or answers 404.
  - `read_recent_results` (`GET /:skill_id/results`).
  - Mounts the sub-routers below at `/:skill_id/resources`, `/:skill_id/notes`, `/:skill_id/quizzes`, `/:skill_id/topics`, `/:skill_id/teach-sessions` and the learning routes.

**[server/routes/skill_topic_routes.js](server/routes/skill_topic_routes.js)**
- `create_skill_topic_router({ database, ai_provider })`: `read_topic_map`, `add_skill_topic`, and `find_topics` (`POST /generate`).

**[server/routes/event_routes.js](server/routes/event_routes.js)**
- `create_event_router({ database })`: `read_events` (needs `?from&to`), `add_event`, `read_event`, `edit_event`, `remove_event`.

**[server/routes/work_block_routes.js](server/routes/work_block_routes.js)**
- `create_work_block_router({ database })`: `begin_work_block`, `read_active_work_block`, `end_work_block`.
- `check_work_block_fields` collects the field errors.

**[server/routes/skill_resource_routes.js](server/routes/skill_resource_routes.js)**
- `create_skill_resource_router({ database, resource_importer })`:
  - `read_resources`
  - `add_file` (behind `receive_upload`)
  - `add_link`
  - `add_typed_note`
  - Each checks `topic_id` with `resolve_resource_topic_id` before importing, so a bad topic fails fast.

**[server/routes/skill_note_routes.js](server/routes/skill_note_routes.js)** / **[skill_quiz_routes.js](server/routes/skill_quiz_routes.js)**
- `create_skill_note_router` / `create_skill_quiz_router({ database, ai_provider })`:
  - Notes: `read_notes`, and `generate_notes` → `create_study_notes`.
  - Quizzes: `read_quizzes`, and `generate_quiz` → `create_practice_quiz`.

**[server/routes/study_item_routes.js](server/routes/study_item_routes.js)**: routes for single items by their own id.
- `create_resource_router`: `read_resource` (leaves out `file_path`), `file_resource_under_topic` (`PATCH`, → `move_resource_to_topic`), `remove_resource`, and the active reading routes at `/:resource_id/reading`.
- `create_note_router`: `remove_note`.
- `create_quiz_router`: `read_quiz` (no answers), `check_answer`, `grade_quiz`, `remove_quiz`.
- `create_topic_router({ database, ai_provider })`: `edit_topic` (`PATCH`, → `update_topic`), `find_subtopics` (`POST /:id/generate`, → `generate_subtopics`), `remove_topic`.

**[server/routes/ai_routes.js](server/routes/ai_routes.js)**
- `create_ai_router({ ai_provider, transcriber })`: `report_ai_status` → `{ ai_provider, transcription_provider }`.

**[server/routes/assistant_routes.js](server/routes/assistant_routes.js)**
- `create_assistant_router(dependencies)`: `read_assistant` → `get_assistant_state`; `send_message` → `validate_assistant_input`, `run_assistant_turn`; `clear_messages`; `choose_assistant` → `set_assistant_choice`; `confirm_action` and `cancel_action`.

**[server/routes/widget_routes.js](server/routes/widget_routes.js)**
- `create_widget_router({ database })`: `read_widgets`, `read_live_data` → `get_live_widget_data`, `reorder_widgets` → `order_layout_items`, `edit_widget` (title, state, pin and layout; the spec is the assistant's to change), `remove_widget`.

**[server/routes/widget_stack_routes.js](server/routes/widget_stack_routes.js)**
- `create_widget_stack_router({ database })`: `read_stacks`, `make_stack` (`validate_new_stack`), `edit_stack` (`validate_stack_updates`), `take_stack_apart`.

**[server/routes/teach_routes.js](server/routes/teach_routes.js)**
- `create_skill_teach_router({ database })` (`read_skill_lessons`, `start_lesson`) and `create_teach_session_router({ database, ai_provider })` (`read_recent_lessons`, `read_lesson`, `explain`, `finish_lesson`, `grade_lesson`, `remove_lesson`).

**[server/services/http_error.js](server/services/http_error.js)**
- `create_http_error(status, message, extra_body = {}, cause)`: an `Error` marked `is_http_error`, with `status` and `extra_body`, which `handle_errors` turns into a response. Throw these for any expected failure. Pass the underlying error as `cause` so it gets logged without reaching the student.
- `assert_no_field_errors(field_errors)`: throws a 400 with `field_errors` if any exist.

**[server/services/account_validators.js](server/services/account_validators.js)**
- `validate_username`, `validate_password`, `validate_email`, `validate_name(name, field_label)`: each returns an error message or `null`.
- `validate_minutes(minutes, limits, field_label)`: a whole number of minutes within `{ min, max }` (the focus and break lengths).
- `clean_account_field(field_name, value)`: trims text, lowercases email, leaves passwords and numbers untouched.
- `validate_signup_input(input)`: checks all five sign-up fields. Returns `{ field_errors, values }`, where `values` holds the cleaned valid fields.
- `validate_account_updates(input)`: checks only the fields present (`ACCOUNT_UPDATE_FIELDS`: the sign-up fields plus `work_minutes` and `break_minutes`) and requires at least one. Unknown fields such as `id` are ignored. Changing a `PASSWORD_PROTECTED_FIELDS` field (`email`, `password`) also needs `current_password`; the route checks it against the stored hash.
- `validate_delete_confirmation(input)`: `{ password }` must be filled in. Returns an error message or `null`.
- `validate_login_input(input)`: email and password must be filled in. There are no length rules here.

**[server/services/password_service.js](server/services/password_service.js)**
- `hash_password(password)`: scrypt with a random salt. Returns `"<salt hex>:<hash hex>"`.
- `verify_password(password, stored_hash)`: re-hashes with the stored salt and compares in constant time.

**[server/services/session_service.js](server/services/session_service.js)**
- `hash_session_token(session_token)`: SHA-256 hex. The database stores this hash, never the token.
- `create_session(database, user_id, now)`: clears expired sessions, then stores a new one and returns the random token.
- `find_session_user_id(database, session_token, now)`: the owner of an unexpired session, or `null`.
- `delete_session(database, session_token)`: logs out one device.
- `delete_other_sessions(database, user_id, kept_session_token)`: logs out every other device, after a password change.
- `delete_expired_sessions(database, now)`: housekeeping, called by `create_session`.
- `now` defaults to the current time. Tests pass fixed dates to check expiry.

**[server/services/account_service.js](server/services/account_service.js)**
- `to_account(user_row)`: database row → account object (parses `learning_profile`).
- `is_username_taken` / `is_email_taken(database, value, excluded_user_id)`: case-insensitive checks. `excluded_user_id` lets a student keep their own value.
- `assert_identity_available(database, { username, email }, excluded_user_id)`: throws a 409 with `field_errors` for any taken value.
- `get_account(database, user_id)`: the account, or a 404.
- `create_account(database, signup_values)`: hashes the password, checks the username and email, and inserts the user. The check and insert run with no `await` between them, so two sign-ups can't claim the same name.
- `authenticate(database, email, password)`: the account, or a 401 with the same message for an unknown email and a wrong password.
- `assert_password_matches(database, user_id, password, field_name)`: throws a 400 with `field_errors[field_name]` ("That isn't your current password") unless `password` matches.
- `build_user_updates(account_updates)`: picks editable columns (`EDITABLE_COLUMNS`, which include `work_minutes` and `break_minutes`) and swaps `password` for `password_hash`.
- `update_account(database, user_id, account_updates)`: checks for conflicts, updates the row and returns the account. The SQL column names come only from the fixed `EDITABLE_COLUMNS` list.
- `delete_account(database, uploads_path, user_id)`: deletes the user row (cascading to sessions and all their data), then their uploads folder.

**[server/services/progress_service.js](server/services/progress_service.js)**: the Progress page's numbers. Progress bars and comparisons with the period before only; no streaks, badges or levels.
- `get_progress(database, user_id, now)` returns:
  - `skills`: `build_skill_progress` for each skill.
  - `quiz_scores`: average score, last `QUIZ_SCORE_PERIOD_DAYS` against the period before.
  - `study_minutes`: focus minutes from work blocks, last `STUDY_TIME_PERIOD_DAYS` against the week before.
  - `recent_work_blocks`: `[{ started_at, completed_minutes }]` for the chart (the client groups them into days in the student's time zone).
  - `topic_changes`: `{ improved, slipping }`, each `[{ topic_id, topic, skill_name, first_score, latest_score, change }]`.
  - `teaching`: `{ lessons_done, grades }` (grades compared like quiz scores).
  - `totals`: `{ quizzes_taken, topics_total, topics_strong }`.
  - Each compared metric is `{ recent, previous, change, period_days }`; `change` is `null` unless both periods have a value.
- `split_by_period(dated_values, now, period_days)`: `[{ at, value }]` → `{ recent, previous }` value lists.
- `compare_periods(dated_values, now, period_days, combine)`: one compared metric; `combine` is an average or `sum_values`.
- `find_topic_changes(result_rows)` (topics quizzed at least twice) and `pick_topic_changes(topic_changes, max_count)`.
- `build_skill_progress(skill, mastery_scores)`: `{ skill_id, name, color, topic_count, resource_count, level_counts, quizzed_percent, strong_percent, average_mastery }`.
- `sum_values`, `to_percent(part, whole)` (0 when `whole` is 0).

**[server/services/storage_service.js](server/services/storage_service.js)**: the database stores paths relative to the uploads folder (`<user_id>/<file name>`).
- `get_user_folder(uploads_path, user_id)`: `<uploads_path>/<user_id>`.
- `save_user_file(uploads_path, user_id, file_name, file_buffer)`: writes the file and returns its relative path.
- `remove_stored_file(uploads_path, relative_path)`: deletes one file. Succeeds if it is already gone.
- `remove_user_files(uploads_path, user_id)`: deletes the whole folder. Succeeds if it doesn't exist.

**[server/services/skill_validators.js](server/services/skill_validators.js)**
- `validate_skill_name`, `validate_skill_color`: each returns an error message or `null`.
- `validate_skill_input(input, { is_partial })`: new skills need a name; edits need at least one field. Trims the name and uppercases the color.

**[server/services/skill_service.js](server/services/skill_service.js)**
- `list_skills(database, user_id)`: oldest first, each with `resource_count`.
- `get_owned_skill(database, user_id, skill_id)`: the skill, or a 404.
- `assert_skill_name_available(database, user_id, name, excluded_skill_id)`: 409 if the student already has that name, in any letter case.
- `create_skill`, `update_skill`: the column names come only from the validated `name` and `color` fields.
- `delete_skill(database, uploads_path, user_id, skill_id)`: deletes the row (cascading to resources, notes, topics and quizzes), then the uploaded files.

**[server/services/resource_validators.js](server/services/resource_validators.js)**
- `validate_resource_title(title, { is_required })`, `validate_resource_url`, `validate_typed_note_text`, `clean_title`.
- `validate_resource_topic_id` (optional; blank means none) and `clean_topic_id`.
- `validate_file_upload_input`, `validate_link_input`, `validate_typed_note_input`: each returns `{ field_errors, values }`, including `topic_id`.

**[server/services/resource_service.js](server/services/resource_service.js)**
- `list_resources`: summaries, which include `topic_id` and `character_count` but never the text.
- `get_resource_summary`, and `get_owned_resource`: everything, including `extracted_text` and `file_path`, or a 404.
- `insert_resource`: saves the row (with `topic_id` if given) with status `ready` and returns its summary.
- `delete_resource`: deletes the row, then the file.
- `list_skill_sources(database, user_id, skill_id)`: `[{ id, title, extracted_text, topic_id }]` for the AI; empty when there are none.
- `get_skill_overview_text`: an even sample of every resource (`''` with none), for finding topics and whole-skill quizzes.

**[server/services/topic_resource_service.js](server/services/topic_resource_service.js)**: links between resources and topics. (Its own file because it needs both the resource and topic services.)
- `resolve_resource_topic_id(database, user_id, skill_id, topic_id)`: the topic id if it's in that skill, `null` for none; 400 for another skill's topic, 404 for a missing one.
- `move_resource_to_topic(database, user_id, resource_id, topic_id)`: files a resource under a topic in its own skill, or takes it out with `null`.
- `generate_subtopics({ database, ai_provider, user_id, topic_id })`: asks the AI to break a topic down (its own resources first), files the new ones under it, and returns the topic map. 400 at the deepest level.
- `get_topic_source_text(database, user_id, skill_id, { search_text, topic_id, max_characters })`: the AI's material for a topic. With `topic_id` and resources filed under that topic or below it, those come first (`select_focused_source_text`); otherwise the best matches across the skill.

**[server/services/assistant/](server/services/assistant/)**: the assistant.
- `assistant_service.js`:
  - `run_assistant_turn(request)`: the step loop described in [the assistant](#the-assistant-and-widgets-phase-10). Returns `{ user_message, assistant_message, client_actions, data_changed }`.
  - `confirm_assistant_action` (runs a pending action with its saved arguments) and `cancel_assistant_action`.
  - `get_assistant_state`, `get_assistant_id` (the student's choice, or the default), `set_assistant_choice`, `clear_assistant_messages`.
  - `list_assistant_messages`, `save_assistant_exchange` (one transaction), `to_public_message` / `to_public_action` (arguments stay on the server), `to_history_message` (a reply plus its actions and links, so later turns know the ids of things made), `describe_actions`.
- `assistant_context.js`: `build_assistant_context` (the overview text, the skills and the page's skill), `PAGE_GUIDE`, `format_local_time`, `format_utc_offset`, `find_page_skill`, `describe_skill_line`.
- `tool_registry.js`: `ASSISTANT_TOOLS`, `ASSISTANT_TOOL_NAMES`, `ACTION_STATUS`, `find_tool`, `describe_tool` (one line per tool for the prompt), `make_label`, `format_result_for_ai` (cut to `ASSISTANT_TOOL_RESULT_CHARACTERS`), `execute_tool` (errors become failed actions), `perform_tool_call` (holds tools with `needs_confirmation`).
- `tool_helpers.js`: the tool shape, `take_values` (validator results or a 400 listing each problem), `require_skill`, `cut_text`, `pick_sent`, `name_skill`, `count_words`.
- `study_tools.js` (`STUDY_TOOLS`, with `to_tool_topic`, `name_topic`, `name_resource`, `skill_map_link`), `learning_tools.js` (`LEARNING_TOOLS`), `planning_tools.js` (`PLANNING_TOOLS`, `ASSISTANT_SETTING_FIELDS`), `widget_tools.js` (`WIDGET_TOOLS` including `stack_widgets` and `unstack_widgets`; apps take a `brief`; `WIDGET_GUIDE`; `build_app_spec(context, { title, brief, current_html })` runs the app builder and its retries; `pick_layout_changes(args)` for the shared `width`, `mode`, `stays`, `appearance`, `accent`, `content_size` and `collapsed` parameters).
- `assistant_validators.js`: `validate_assistant_input({ message, page, utc_offset_minutes })`.

**[server/services/widget_specs.js](server/services/widget_specs.js)**: what a widget may contain. `clip_text`, `is_dashboard_link`, `clean_widget_block` (one cleaner per block type), `clean_widget_spec(kind, spec)`, `clean_pinned_paths(list)`, `validate_widget_state`, `find_incomplete_html(html)` (`APP_PAIRED_TAGS`), `find_script_error(html)`, `APP_SIZE_HOOKS` and `APP_SIZE_ERROR` (an app must have a compact layout), `APP_BLOCKED_CODE` (code the sandbox blocks, and what to use instead), `validate_widget_layout(changes, current_layout)` (choices from `LAYOUT_CHOICES`; switches `LAYOUT_SWITCHES`; pixel values from `LAYOUT_PIXELS` and look numbers from `WIDGET_LOOK_NUMBERS` rounded and kept within their limits; `find_layout_error`), `validate_widget_order` (`{ items }`), `validate_new_widget` (optional `layout` changes), `validate_widget_updates(input, kind, current_layout)`, and for stacks `validate_stack_widget_ids`, `validate_new_stack`, `validate_stack_updates`.

**[server/services/widget_service.js](server/services/widget_service.js)**: `to_widget` (fills in `DEFAULT_WIDGET_LAYOUT`), `list_widgets`, `get_owned_widget`, `create_widget` (at most `MAX_WIDGETS`), `update_widget`, `order_layout_items(database, user_id, items)` (widgets and stacks, in one transaction), `delete_widget` (also takes it out of its stack), and `get_live_widget_data(database, user_id, { source, skill_id, now })` for each of `WIDGET_LIVE_SOURCES`.

**[server/services/widget_stack_service.js](server/services/widget_stack_service.js)**: Smart Stacks. `to_stack`, `list_stacks`, `get_owned_stack`, `find_widget_stack`, `create_stack` (each widget the student's and in no other stack; at most `MAX_WIDGET_STACKS`), `update_stack` (reorder, add or drop widgets; a dropped widget shows where the stack is; one left takes it apart and returns `null`), `delete_stack` (in one transaction; its widgets show where it was), `remove_widget_from_stacks`.

**[server/services/note_service.js](server/services/note_service.js)** also has `get_owned_note` (for the assistant's read_note).

**[server/services/resource_importer.js](server/services/resource_importer.js)**
- `create_resource_importer({ database, uploads_path, transcriber })` returns three functions. Each resolves to the resource summary plus `is_truncated`.
  - `import_file`: checks the type, extracts the text, saves the file, then inserts the row. The title defaults to the file name.
  - `import_link`: YouTube links use the captions and video title; other links are read as articles.
  - `import_typed_note`: saves typed or pasted notes.
- `prepare_extracted_text(raw_text, resource_type)`: normalizes the text, refuses it with that type's `NO_TEXT_MESSAGES` entry if it's (almost) empty, and caps the length.
- `get_title_from_file_name`: "Week 3 notes.pdf" becomes "Week 3 notes".

**[server/services/extraction/](server/services/extraction/)**
- `text_cleanup.js`:
  - `normalize_extracted_text`: one kind of line ending, single spaces, at most one blank line in a row.
  - `limit_text_length` → `{ text, is_truncated }`.
  - `assert_enough_text(text, problem_message)`: a 422 below 20 characters.
- `pdf_extractor.js`:
  - `extract_pdf_text(pdf_buffer)`: uses pdf-parse; an unreadable PDF becomes a 422.
  - `remove_page_markers`: strips pdf-parse's "-- 1 of 3 --" lines.
- `file_extractor.js`: `get_file_extension`, `get_file_resource_type`, and `extract_file_text({ resource_type, file_buffer, file_name, transcribe })`.
- `safe_fetch.js`:
  - `is_private_address(ip)`: covers IPv4, IPv6 and IPv4-mapped addresses.
  - `parse_web_url`: http and https only.
  - `assert_public_host(hostname, lookup_address)`: resolves every address and refuses private ones.
  - `read_limited_text(response, max_bytes)`.
  - `fetch_public_text(url, { max_bytes, timeout_ms, lookup_address, fetch_function })`: follows redirects by hand, checking each hop.
  - DNS and fetch can be injected for tests.
- `article_extractor.js`:
  - `extract_article(html)` → `{ title, text }`. It prefers `og:title`; reads `<article>`, then `<main>`, then `<body>`; turns paragraph-like blocks into paragraphs; and drops nav, scripts and footers.
  - `remove_citation_markers`: strips "[5]" and "[citation needed]".
  - `fetch_article(url)`: plain-text pages are used as they are; non-HTML pages are refused.
- `youtube_extractor.js`:
  - `get_youtube_video_id(url)`: handles watch, youtu.be, shorts, embed and live links.
  - `decode_caption_text`: undoes HTML entities, including double-encoded ones.
  - `join_transcript_parts`.
  - `fetch_youtube_transcript(video_id)`: English captions first, then any language.
  - `fetch_youtube_title(video_id)`: uses the public oEmbed endpoint, with a generic fallback.

**[server/services/ai/](server/services/ai/)**: see [AI providers](#ai-providers).
- `ai_providers.js`: `create_named_ai_provider(provider_name, ai_config)`, `create_ai_provider(ai_config)` (the `AI_PROVIDER` one), `create_transcriber(ai_config)`, `create_mock_transcriber()`, `create_gemini_clients(ai_config)` (one client per Gemini key, or one keyless client so the SDK can find its own credentials).
- `chat_assistants.js`:
  - `is_provider_available(provider_name, ai_config)`: practice mode and the main provider always; others when their key is set.
  - `create_chat_assistants(ai_config, build_provider)` → `{ options, default_id, resolve_assistant_id, plan_step(assistant_id, step_request) }`. Each provider is built once; `plan_step` adds the AI's `task_tier`.
- `assistant_prompts.js`: `build_assistant_step_request`, `build_assistant_json_schema(tool_names)` (tool names limited to the real ones; arguments as JSON text), `COMMON_SENSE_RULES`, `ASSISTANT_RULES`, `format_assistant_history`, `format_step_results`.
- `assistant_outputs.js`: `normalize_assistant_step(ai_output, tool_names)` (drops unknown tools; 502 when there is neither a reply nor a call) and `parse_tool_arguments`.
- `mock_assistant.js`: practice mode's assistant. `build_mock_assistant_step`, `plan_mock_tool_calls` (`REQUEST_RULES`), `write_mock_reply`, `quote_resources`, `read_result`, `find_page_path` (`PAGE_WORDS`), `pick_message_skill`, `clean_match`, `split_list_items`.
- `mock_ai_provider.js`:
  - `create_mock_ai_provider`, `build_mock_notes`, `build_mock_quiz`, `build_mock_topics`, and `plan_assistant_step` from `mock_assistant.js`.
  - `assert_has_sources` and `NEEDS_SOURCES_MESSAGE`: practice mode can't work without resources.
  - `rank_sentences`, `strip_source_labels`, `build_key_term_lines`.
  - `pick_answer_word`, `blank_out_word`, `shares_word_stem` (keeps "photosynthetic" from being a wrong answer for "photosynthesis").
  - `build_blank_question`.
- `llm_ai_provider.js`: `create_llm_ai_provider(provider_name, complete_json)`.
- `anthropic_completer.js`:
  - `create_anthropic_completer({ api_key, model })`: `beta.messages.create` with `output_config.format` (JSON schema), `effort: "medium"` and `fallbacks: "default"`.
  - `parse_completion`: turns a refusal into a 422 and a cut-off answer into a 502.
  - `read_response_text`.
- `openai_completer.js`: `create_openai_completer({ api_key, model })` and `create_openai_transcriber({ api_key })` (Whisper, `whisper-1`).
- `gemini_completer.js`:
  - `create_gemini_client(api_key)`, and `create_gemini_completer({ model_chains, gemini_clients })` (one client per key), which picks the tier's model list and thinking level.
  - `run_with_model_fallback(model_chain, run_model, should_try_next_model)`, and inside it for each model `run_with_key_fallback(clients, run_with_client)`, which moves to the next key on `is_key_specific_gemini_error` (429, 401, 403 or a refused key).
  - `create_client_rotation(clients)`: `take_turn()` gives the keys in order for one request, each request starting one key further along.
  - `is_retryable_gemini_error` (429/5xx) and `is_retryable_transcription_error` (also 400 and empty transcripts).
  - `parse_gemini_json`: a blocked answer becomes a 422, a cut-off one a 502.
  - `get_gemini_error_kind`, `map_gemini_error`.
  - `create_gemini_transcriber({ model_chain, gemini_clients })`, `transcribe_with_client` (one key: upload, try each model, delete the upload), `transcribe_with_model`, `get_media_type`.
  - `read_transcript_text`: reads both `audioTranscription` parts (speech models) and text parts.
  - `prepare_media_part`: sends recordings of 18 MB or less inside the request and uploads larger ones through the Files API, which are deleted afterwards. `wait_for_file_ready` waits for an upload to finish processing.
- `ai_errors.js`:
  - `AI_ERROR_KIND` (`auth`, `busy`, `other`).
  - `get_sdk_error_kind(error, sdk)`: for Anthropic and OpenAI.
  - `map_ai_error(error, { error_kind, key_variable_name })`:
    - Rejected API key → 502 naming the `.env` setting to fix.
    - Busy or out of quota → 503.
    - Anything else → 502.
- `ai_prompts.js`:
  - `SUBJECT_RULE` and `format_study_context({ skill_name, topic, topic_path }, topic_label)`: every request about a topic names the subject and the topic's place on the map, and says to read the topic in that light.
  - `build_notes_request`, `build_quiz_request` (with `is_source_only`), both taking `skill_name` and `topic_path`.
  - `build_topics_request({ skill_name, source_text, max_topics, focus_topic, existing_topics })`, with `describe_topic_task` choosing between a whole subject and one topic's subtopics.
  - The AI student: `build_ai_student_reply_request`, `build_ai_student_quiz_request` (both told the subject with `format_subject_note(skill_name)`), `format_lesson`, `format_numbered_question`, `AI_STUDENT_REPLY_JSON_SCHEMA`, `AI_STUDENT_QUIZ_JSON_SCHEMA`.
  - `SOURCE_RULES`, `get_source_rules(source_text, is_source_only)`, `PLAIN_MARKDOWN_RULE`.
  - `wrap_sources`, `format_sources_block` (nothing when there are no sources).
  - `NOTES_JSON_SCHEMA`, `QUIZ_JSON_SCHEMA`, `TOPICS_JSON_SCHEMA`.
- `ai_student_answers.js`: `to_choice_index(choice_number, choice_count)` and `normalize_ai_student_answers(raw_output, questions)` → `{ answers, reasons, feedback }`, one per question.
- `mock_ai_student.js`: `build_mock_ai_student_reply`, `build_mock_ai_student_answers`, and helpers `get_teacher_text`, `pick_word_to_ask_about`, `pick_taught_choice` (never guesses on a tie), `find_teaching_sentence`.
- Real providers (`llm_ai_provider.js`) and the mock both have `reply_as_ai_student({ topic, lesson_messages })` → `{ reply }` and `take_quiz_as_ai_student({ topic, lesson_messages, questions })` → `{ answers, reasons, feedback }`.
- The learning methods, on every provider:
  - `generate_lesson({ skill_name, topic, source_text, step_count, learning_style })` → `{ steps }` (stored shape, each with its first check unanswered).
  - `reteach_lesson_step({ skill_name, topic, step, missed_check: { question, chosen_choice, correct_choice }, source_text, learning_style })` → `{ reteach_markdown, check }`.
  - `order_learning_path({ skill_name, topics: [{ topic, summary, parent_topic }] })` → `{ steps: [{ index, reason }] }`, every topic once.
  - `generate_practice({ skill_name, topic, source_text, problem_count, learning_style })` → `{ worked_example, problems }`.
  - `check_practice_answer({ topic, problem, answer, solution_steps, student_answer })` → `{ is_correct, feedback }`.
  - `guide_reading_section({ resource_title, section_title, section_text, learning_style })` → `{ explanation_markdown, think_about }`.
  - `explain_text({ skill_name, text, style, context_text, learning_style })` → `{ explanation_markdown }`.
  - `generate_glossary({ skill_name, source_text, topics, existing_terms, max_terms })` → `{ terms: [{ term, definition, topic }] }`.
- `learning_prompts.js`: one `build_*_request` per learning method (`build_lesson_request`, `build_reteach_request`, `build_learning_path_request` with `format_path_topic`, `build_practice_request`, `build_practice_check_request`, `build_reading_guide_request`, `build_explain_request`, `build_glossary_request`), their JSON schemas, `CHECK_RULES` and `EXPLAIN_STYLE_INSTRUCTIONS`. Student text (answers, sections, passages) goes inside tags and is described as material, never instructions.
- `learning_outputs.js`: cleans what real AIs return. `clean_text`, `clean_text_list`, `require_text` (502 when missing), `normalize_check`, `to_lesson_check`, `normalize_lesson_steps`, `normalize_reteach`, `normalize_path_order` (drops repeats and out-of-range numbers, adds left-out topics at the end), `normalize_practice` (at most 3 hints), `normalize_practice_check` (only a clear `true` is correct), `normalize_reading_guide`, `normalize_explanation`, `normalize_glossary_terms`.
- `mock_learning.js`: practice mode's versions. `build_mock_lesson` / `build_mock_lesson_step` (fill-in-the-blank checks from the resources' sentences), `build_mock_reteach`, `build_mock_learning_path` (keeps map order), `build_mock_practice` / `build_mock_worked_example` / `build_mock_problem`, `build_mock_practice_check` with `normalize_answer_text`, `build_mock_reading_guide`, `build_mock_explanation` (quotes related sentences), `build_mock_glossary` with `pick_matching_topic`.
- `quiz_questions.js`:
  - `is_valid_quiz_question`: exactly 4 different choices and a valid `correct_index`.
  - `normalize_quiz_questions(raw, max_count)`: keeps the valid questions; 502 if none are usable.
- `source_selection.js`:
  - `split_into_chunks(text, chunk_size)`, `SOURCE_LABEL_PREFIX`, `label_chunk(title, text)`.
  - `order_for_even_coverage(chunk_count)`: chunk positions ordered start, middle, quarters, eighths…, so any first few spread across the whole text.
  - `select_source_text(sources, topic, { max_characters, chunk_size, only_matching })`: the parts that match a topic. `only_matching` leaves out chunks that never mention it.
  - `select_overview_text(sources, { max_characters, chunk_size })`: takes chunks from each resource in turn, in even-coverage order, returned in reading order. Used for topics, whole-skill quizzes and one-resource quizzes.
  - `select_focused_source_text(focus_sources, other_sources, topic, options)`: a topic's own resources first (evenly sampled), then matching parts of the rest.
- `text_analysis.js`: `STOP_WORDS`, `split_into_words`, `get_topic_words`, `split_into_sentences`, `count_topic_matches`, `find_keywords`.
- `learning_style_hints.js`: `STUDY_TIPS`, `NOTE_STYLE_INSTRUCTIONS`, `get_study_tip`, `get_note_style_instruction`.

**[server/services/study_validators.js](server/services/study_validators.js)**
- `validate_topic`, `validate_question_count`, `validate_optional_id`, `validate_notes_input`.
- `validate_required_id`, `find_quiz_scope_errors(scope, input)`.
- `validate_quiz_input`: `scope` defaults to `topic` (which needs `topic_id` or a typed `topic`); `resource` needs `resource_id`; `skill` needs nothing. Only the fields for the scope are kept, and the default count is filled in.
- `validate_resource_topic_input({ topic_id })`.
- `validate_topic_input({ topic, parent_topic_id })`, `validate_topic_update_input({ topic?, parent_topic_id? })`.
- Lessons: `validate_teach_session_input`, `validate_teach_message`, `validate_teach_question_count`.
- `is_valid_answer`, `validate_quiz_answers(answers, questions)` (one choice index or `null` per question), and `validate_answer_check`.

**[server/services/note_service.js](server/services/note_service.js)**
- `list_notes`, `delete_note`.
- `create_study_notes({ database, ai_provider, user_id, skill_id, topic })`: when a map topic has the same name, the note is linked to it and that topic's resources come first.

**[server/services/quiz_service.js](server/services/quiz_service.js)**
- `to_public_quiz(quiz_row)`: removes the answers and adds `topic_id`, `scope` and `resource_id`.
- `list_quizzes`: includes `question_count`, `topic_id`, `scope` and `resource_id`.
- `get_owned_quiz`, `delete_quiz`.
- `resolve_quiz_topic(database, user_id, skill_id, { topic, topic_id })`: returns `{ topic, topic_id, search_text }`. It uses the map topic named by id, or matches a typed topic to a map topic by name.
- `plan_quiz(database, user_id, skill, quiz_details)` → `{ scope, topic, topic_id, resource_id, ai_topic, source_text, is_source_only }`, through `plan_skill_quiz`, `plan_topic_quiz` or `plan_resource_quiz` (400 for another skill's resource).
- `create_practice_quiz({ database, ai_provider, user_id, skill, quiz_details })`: plans, asks the AI, saves.
- `check_quiz_answer(quiz_row, question_index, answer_index)`: returns `{ is_correct, correct_index, explanation }` and saves nothing.
- `grade_quiz_answers(questions, answers)`: returns `{ correct_count, total_count, score, question_results }`. Skipped questions count as wrong.
- `save_quiz_result(database, { user_id, quiz_row, answers, taker, teach_session_id })`: grades and saves one `quiz_results` row for either taker.
- `submit_quiz_answers(database, user_id, quiz_row, answers, teach_session_id)`: saves the student's result, updates the topic's mastery, and returns `{ result, question_results, topic }`.
- `list_quizzes` leaves out quizzes that belong to a lesson.
- `list_recent_results(database, user_id, skill_id)`: the last 20 results, newest first.

**[server/services/mastery.js](server/services/mastery.js)**
- `MASTERY_LEVEL`.
- `get_mastery_level(score)`: strong at 80% or more, developing at 50–79%, weak below 50%, untested for `null`.
- `average_score(scores)`.
- `describe_suggestion_reason(topic)`, and `describe_mastery_for_chat(topic)` ("weak, 33%", for the assistant's prompt).
- `rank_study_suggestions(topics)`: up to 3 suggestions, ordered weak (lowest score first), then untested, then developing. Strong topics are never suggested.

**[server/services/topic_service.js](server/services/topic_service.js)**
- `to_topic` (adds `mastery_level`), `list_topics`.
- `get_topic_map`: returns `{ topics, suggestions }`.
- `get_owned_topic`, `find_topic_by_name` (any letter case).
- `list_topic_branch_ids(database, topic_id)`: the topic and every topic under it (a recursive query that stops on loops).
- `format_topic_path(database, topic_id)`: "Maritime empires > Maritime technologies" (`TOPIC_PATH_SEPARATOR`), or `null` without a topic. Sent to the AI with every request about a map topic.
- `get_topic_depth` (1 for a main topic), `get_branch_height` (levels in a branch), `fits_under_parent(database, parent_topic_id, branch_height)`.
- `add_topic(database, user_id, skill_id, { topic, summary, parent_topic_id })`: refuses duplicates, parents from another skill, more than 6 levels, and more than 80 topics per skill.
- `update_topic(database, user_id, topic_id, { topic?, parent_topic_id? })`: renames and/or moves a topic with its branch; refuses loops and moves that go too deep.
- `save_generated_topics(..., root_parent_id)`: adds only new topics, under `root_parent_id` when breaking one topic down (and then only linking parents inside that branch), then links parents in a second pass.
- `generate_skill_topics({ database, ai_provider, user_id, skill })`.
- `delete_topic`: subtopics and resources move up to the deleted topic's parent; quizzes and notes are kept.
- `update_topic_mastery(database, topic_id)`: the average of the last 3 student scores.

**[server/services/teach_service.js](server/services/teach_service.js)**: "Teach the AI student".
- `TEACH_SESSION_STATUS`, `get_teach_session_status(row)`, `build_greeting(topic)`, `count_teacher_messages`, `combine_scores(student_score, ai_student_score)`.
- `to_teach_session(database, row)`: the shape above. `build_teach_review` puts both answers side by side; `find_session_result(database, session_id, taker)`.
- `get_owned_teach_session` (404 otherwise), `list_teach_sessions(database, user_id, { skill_id, limit })`.
- `start_teach_session(database, user_id, skill, { topic, topic_id })`.
- `add_teaching_message({ ..., session_row, message })`: 409 after the lesson, 400 after 15 explanations.
- `start_lesson_quiz({ ..., skill, session_row, question_count })`: makes the quiz, has Pip answer, saves Pip's result, reasons and feedback. Removes the quiz again if Pip's answer fails.
- `submit_lesson_answers({ database, user_id, session_row, answers })` → `{ teach_session, topic }`.
- `delete_teach_session`: with its quiz and results.

**[server/services/guided_lesson_service.js](server/services/guided_lesson_service.js)**: guided lessons.
- `get_current_check(step)` (the latest), `is_check_correct`, `to_public_check` (answer hidden until answered), `can_reteach(step)` (answered wrongly and fewer than `MAX_LESSON_RETEACHES` re-explanations), `count_first_try_correct`.
- `to_guided_lesson(row)`: the shape above. `get_owned_guided_lesson` (404 otherwise), `list_guided_lessons(database, user_id, skill_id, limit)`.
- `start_guided_lesson({ database, ai_provider, user_id, skill, lesson_details })`: resolves the topic like a quiz (`resolve_quiz_topic`), gathers its resources and saves the AI's steps.
- `answer_lesson_check` (409 if answered or finished), `reteach_current_step` (409 unless `can_reteach`), `advance_guided_lesson` (409 until answered; sets `completed_at` after the last step), `delete_guided_lesson`.

**[server/services/learning_path_service.js](server/services/learning_path_service.js)**: the learning path.
- `list_path_topics(topics)`: the topics with no subtopics, depth first, with their parent's name.
- `summarize_topic_lessons(lesson_rows)`, `assign_path_statuses(path_steps)` (`PATH_STEP_STATUS`).
- `get_learning_path(database, user_id, skill)`: the saved order, without deleted topics, with new ones at the end.
- `build_learning_path({ database, ai_provider, user_id, skill })`: finds topics first if there are none (`generate_skill_topics`), then saves the AI's order (replacing any earlier path).

**[server/services/practice_service.js](server/services/practice_service.js)**: practice with hints.
- `is_problem_solved`, `to_public_problem` (only shown hints; solution only when shown), `to_practice_set`, `get_owned_practice_set`, `list_practice_sets`.
- `create_practice_set({ ..., skill, practice_details })`, `find_problem(row, index)` (404 otherwise), `reveal_hint` (409 when none are left), `reveal_solution`, `check_practice_answer` (409 once solved; saves every attempt), `delete_practice_set`.

**[server/services/reading_service.js](server/services/reading_service.js)**: active reading.
- `split_into_reading_sections(text, section_length)` → `[{ title, text }]`, using `is_heading_line`, `split_long_paragraph` and `make_section_title`. Sections are worked out from the text each time, which is stable because a resource's text never changes.
- `clamp_position`, `get_reading_overview`, `get_reading_section`, `guide_reading_section` (asks the AI only the first time), `save_reading_position`, `explain_reading_passage` (style `plain`, the section as material), `list_reading_resources`.

**[server/services/explain_service.js](server/services/explain_service.js)**: `explain_another_way({ ..., skill, explain_details: { text, style, topic_id } })`. Checks the topic is in the skill, then gives the AI up to `EXPLAIN_SOURCE_CHARACTERS` of matching resource text.

**[server/services/glossary_service.js](server/services/glossary_service.js)**: key terms. `list_glossary_terms` (alphabetical), `count_room_for_terms`, `add_glossary_term` (409 with `field_errors.term` for a repeat), `generate_glossary_terms` (links each term to a topic by name; skips ones already there), `delete_glossary_term`.

**[server/services/learning_validators.js](server/services/learning_validators.js)**: `validate_count`, `validate_text`, `validate_topic_with_count`, `validate_lesson_input`, `validate_practice_input`, `validate_choice_index`, `validate_practice_answer`, `validate_passage`, `validate_explain_input`, `validate_glossary_term_input`.

**[server/services/ai/widget_app_prompts.js](server/services/ai/widget_app_prompts.js)**: the app builder. `APP_BUILDER_GUIDE` (its system prompt), `APP_FINAL_CHECKS`, `WIDGET_APP_JSON_SCHEMA` (`{ html, height, summary }`), `build_widget_app_request({ title, brief, current_html, problem, previous_html })` on the `build` tier, and `normalize_widget_app(output)`.

**[server/services/ai/widget_app_examples.js](server/services/ai/widget_app_examples.js)**: `CALCULATOR_APP`, `CONVERTER_APP` and `COUNTER_APP`, finished apps shown to the builder as examples, and `build_mock_widget_app({ title, brief })`, practice mode's builder.

**[server/services/ai/topic_list.js](server/services/ai/topic_list.js)**: `normalize_topic_list(raw_topics, max_topics)` trims topic names, drops blank, overly long and repeated ones, clears parents that point to themselves, and caps the list. It returns a 502 if no topics are left.

**[server/services/event_validators.js](server/services/event_validators.js)**
- `to_iso_timestamp`: every stored time is in one ISO format, so times compare correctly as text.
- `validate_event_title`, `validate_event_details`.
- `validate_event_times`: the end must be after the start, and an event lasts at most 24 hours.
- `validate_event_input(input, { is_partial, current_event })`: edits are checked against the event's existing times.
- `validate_event_range({ from, to })`: at most 62 days.

**[server/services/event_service.js](server/services/event_service.js)**
- `list_events(database, user_id, from, to)`: events that overlap the range, earliest first, each with `skill_name` and `skill_color`.
- `get_owned_event`, `create_event`, `update_event`, `delete_event`: a subject must be one of the student's own skills.

**[server/services/work_block_service.js](server/services/work_block_service.js)**
- `validate_activity` (`quiz` or `assignment`), `validate_planned_minutes` (5–120).
- `count_completed_minutes(work_block, now)`: elapsed whole minutes, capped at the planned length.
- `get_owned_work_block`.
- `get_active_work_block`: the unfinished block, or `null`.
- `start_work_block(database, user_id, { activity, event_id, skill_id, planned_minutes }, now)`: the length defaults to the student's `work_minutes`, and the subject comes from the event. A running block is ended first.
- `finish_work_block(..., { completed_minutes, activity }, now)`: can only happen once, and minutes are capped at the plan.
- Every work block comes with `break_minutes`, `event_title` and `skill_name`.

**[server/services/learning_profile_validators.js](server/services/learning_profile_validators.js)**
- `validate_quiz_answer(question, answer)`: an error message or `null`.
  - `single`: must be one of the option values.
  - `multiple`: an array of option values, between `min_choices` and `max_choices` (repeated values count once).
  - `text`: a string under `max_length`; may be blank when `required: false`.
- `clean_quiz_answer(question, answer)`: removes repeated choices, trims text, and stores skipped text as `''`.
- `validate_learning_profile(answers, questions)`: checks every question. Returns `{ field_errors, values }`, with `field_errors` keyed by question id. Keys that aren't questions are dropped.

**[server/services/learning_profile_service.js](server/services/learning_profile_service.js)**
- `get_learning_style(database, user_id)`: `null` when the quiz was skipped.
- `get_timer_preferences(learning_profile)`: `{ work_minutes, break_minutes }` from the chosen `session_length` option.
- `save_learning_profile(database, user_id, learning_profile)`: stores the answers as JSON, sets the timer minutes and returns the account. **Retaking the quiz resets the timer** to match the new answer.

**[server/tests/helpers/](server/tests/helpers/)**: test-only.
- `test_accounts.js`: `TEST_SIGNUP` (valid sign-up details) and `create_test_account(database, overrides)`, which creates an account from `TEST_SIGNUP` with any fields swapped for those in `overrides`.
- `learning_answers.js`: `VALID_LEARNING_ANSWERS`, a complete set of quiz answers.
- `build_test_pdf.js`: `build_test_pdf(line_text)` builds a real one-page PDF, so the tests need no fixture files.
- `study_fixtures.js`:
  - `SAMPLE_STUDY_TEXT`.
  - `create_student_with_skill(database)`.
  - `insert_test_resource(database, { user_id, skill_id, title, text, topic_id })`.
  - `create_spied_ai()`: the mock AI and transcriber, with spies on every method.

Route tests that add links replace the article and YouTube fetchers with `vi.mock`, so no test touches the internet.

---

## Client reference

**[client/src/main.jsx](client/src/main.jsx)**: mounts `<App />` into `#root` inside `StrictMode` and imports the theme.

**[client/src/App.jsx](client/src/App.jsx)**
- `App()`: wraps the router in `ThemeProvider`, `AuthProvider` and `ConfirmProvider`, so every page can call `use_theme()`, `use_auth()` and `use_confirm()`.

### Config, routing and login state

**[client/src/config/constants.js](client/src/config/constants.js)**:
- `APP_NAME`
- `API_BASE_URL` (from `VITE_API_URL`, falling back to `DEFAULT_API_BASE_URL`)
- `SESSION_TOKEN_STORAGE_KEY`, and the device preferences `SELECTED_SKILL_STORAGE_KEY`, `QUIZ_REMINDER_DISMISSED_KEY`, `THEME_STORAGE_KEY`
- `DATA_CHANGE_DELAY_MS`, `RETURN_REFRESH_AFTER_MS`, `SYNC_CHANNEL_NAME` (keeping data in step)
- HTTP status numbers
- `ROUTE_PATHS` (every public path)
- `PAGE_TRANSITION_MS`
- `LOADING_DOT_DELAYS_MS`
- `MAIN_CONTENT_ID`
- `SIGN_UP_STEP_COUNT`
- `ASSISTANT_MESSAGE_MAX_LENGTH`, `WIDGET_PIN_EVERYWHERE`, `WIDGET_TITLE_MAX_LENGTH`, `WIDGET_HEIGHT_LIMITS`, `WIDGET_CONTENT_HEIGHT` (match the server), `SHELF_COLUMNS`, `SHELF_GRID_QUERY`, `WIDGET_FULL_ROW_SHARE`, `WIDGET_RESIZE_STEP_PX`, the floating values (`WIDGET_FLOAT_WIDTH`, `WIDGET_FLOAT_HEIGHT`, `FLOAT_DEFAULT_WIDTH_PX`, `FLOAT_TOP_PX`, `FLOAT_CASCADE_PX`, `WIDGET_SNAP_DISTANCE_PX`, `WIDGET_EDGE_MARGIN_PX`, `WIDGET_KEYBOARD_MOVE_PX`), `STACK_SCROLL_SETTLE_MS`, the content shapes (`WIDGET_SIZE_CLASS_WIDTHS`, `WIDGET_LANDSCAPE_RATIO`, `WIDGET_PORTRAIT_RATIO`, `CHECKLIST_COLUMNS_MIN_ITEMS`, `LIVE_COMPACT_ITEMS`), `ASSISTANT_SHORTCUT_KEY`, `COUNTDOWN_REFRESH_MS`, `ASSISTANT_PANEL_ID`, `DEFAULT_SPEECH_LANGUAGE`
- `WIDE_LAYOUT_QUERY`, `MAX_TOPIC_DEPTH`, `DEFAULT_MAP_DETAIL_LEVEL`
- `AI_STUDENT_NAME`, `TEACH_MESSAGE_MAX_LENGTH`, `TEACH_QUIZ_QUESTION_COUNT` (match the server)
- `WORK_MINUTES_LIMITS`, `BREAK_MINUTES_LIMITS` (match the server), `STUDY_TIME_CHART_DAYS`, `MINUTES_PER_HOUR`
- `LESSON_STEP_COUNT`, `PRACTICE_PROBLEM_COUNT`, `PRACTICE_ANSWER_MAX_LENGTH`, `READING_PASSAGE_MAX_LENGTH`, `EXPLAIN_TEXT_MAX_LENGTH`, `GLOSSARY_TERM_MAX_LENGTH`, `GLOSSARY_DEFINITION_MAX_LENGTH` (match the server)

**[client/src/config/dashboard_pages.js](client/src/config/dashboard_pages.js)**: `DASHBOARD_PAGES`, one entry per dashboard page (`path`, `label`, `icon`) in sidebar order: Skill map, Learn, Teach the AI student, Quiz, Work block, Schedule, Progress, Settings. Both the sidebar and the router are built from this list.

**[client/src/config/resource_types.js](client/src/config/resource_types.js)**:
- `RESOURCE_TYPE_DETAILS`: a label and icon per resource type.
- `ACCEPTED_FILE_EXTENSIONS`: keep in sync with the server's list.
- `UPLOAD_MAX_BYTES` and `UPLOAD_MAX_LABEL`.
- `DEFAULT_SKILL_COLOR`.
- `QUIZ_QUESTION_COUNT`.

**[client/src/routes/app_routes.jsx](client/src/routes/app_routes.jsx)**
- `app_routes`: the site map (see [Pages and navigation](#pages-and-navigation)). Pages are `lazy()` imports; layouts and guards load up front.
- `DASHBOARD_PAGE_COMPONENTS`: dashboard path → page component (lazy). **To add a dashboard page, add it here and to `DASHBOARD_PAGES`.**
- `get_dashboard_page_element(page)`: that page's element.
- `create_app_router()`: `createBrowserRouter(app_routes)`.

**[client/src/context/AssistantContext.jsx](client/src/context/AssistantContext.jsx)**
- `AssistantProvider`: holds `is_open`, `draft_request` (a question to type in when it opens), `widgets_state` and `stacks_state` (the student's widgets and Smart Stacks, shared by the shelf, the floating layer, the panel and the chat). `open_assistant(draft?)`, `close_assistant()`, and `announce(text)`, which says a change aloud through one `role="status"` line for the whole page.
- `use_assistant()`: the context, or `null` outside a dashboard page (so "Ask the assistant" hides there).

**[client/src/context/AuthContext.jsx](client/src/context/AuthContext.jsx)**
- `AUTH_STATUS`: `loading`, `signed_in`, `signed_out`. `SIGN_OUT_REASONS`: `session_ended`, `logged_out_elsewhere`.
- `AuthProvider`: holds `account`, `status` and `sign_out_reason`. If a token is saved, it starts as `loading` and calls `fetch_account`. If that fails, the student is `signed_out`.
  - Signs out (with a reason) on `SESSION_ENDED_EVENT` and when another tab removes the token; loads the account when another tab saves a new one.
  - While signed in, reloads the account on every `DATA_CHANGED_EVENT` (a failed reload keeps the current one).
- The provider exposes `sign_up(details)`, `log_in(email, password)`, `log_out()` (always ends `signed_out`, even if the server call fails) `set_account(account)` (used after saving changes) and `forget_account()` (ends `signed_out` without calling the server, used after the account is deleted).
- `use_auth()`: reads the context. It throws if used outside `AuthProvider`.

**[client/src/context/ConfirmContext.jsx](client/src/context/ConfirmContext.jsx)**
- `ConfirmProvider`: the app's "Are you sure?" popup (a `Dialog`). `confirm({ title, message, confirm_label, cancel_label?, tone? })` returns a promise of `true` or `false`; `tone` is `danger` (default) or `primary`. Cancel gets focus first; Cancel, the X and Escape all answer `false`.
- `use_confirm()`: the provider's `confirm`, or `confirm_with_browser` (the browser's own box) outside it.

**[client/src/context/ThemeContext.jsx](client/src/context/ThemeContext.jsx)**
- `ThemeProvider { media_window }`: holds the light/dark `choice`, works out `theme` (following the device for "system"), applies it to `<html data-theme>`, and follows changes made in other tabs.
- `use_theme()`: `{ choice, theme, choose_theme }`. It throws if used outside `ThemeProvider`.

### Hooks

- **[use_page_transition(pathname, duration_ms)](client/src/hooks/use_page_transition.js)**: `true` for `duration_ms` after the path changes. Never true on first load.
- **[use_focus_on_navigation(pathname, target_id)](client/src/hooks/use_focus_on_navigation.js)**: focuses `#target_id` after the path changes.
- **[use_escape_key(is_active, on_escape)](client/src/hooks/use_escape_key.js)**: calls `on_escape` on the Escape key while `is_active` is true.
- **[use_api_data(load_data, dependencies, { live })](client/src/hooks/use_api_data.js)**: loads data from the API on mount and whenever `dependencies` change. Unless `live` is `false`, it also refreshes quietly on every `notify_data_changed()`: the data stays on screen while the new copy loads, and a failed refresh keeps it.
  - Returns `{ data, error, is_loading, reload, set_data }`. `set_data` updates the data locally (for example, after adding an item) without fetching again.
  - An answer that arrives after the dependencies have changed is ignored.
- **[use_remembered_skill(skill_id)](client/src/hooks/use_remembered_skill.js)**: saves the skill on the device each time it changes, so the next page opens on it.
- **[use_media_query(query, media_window)](client/src/hooks/use_media_query.js)**: whether a CSS media query matches, updating as it changes.
- **[use_widget_actions()](client/src/hooks/use_widget_actions.js)**: every change to widgets and stacks: `save_widget`, `save_stack`, `save_item`, `save_layout(item, changes)`, `delete_widget`, `save_order(items)` (shown at once, undone if saving fails), and `stack_together(target, dragged)`, `remove_from_stack`, `unstack` (wait for the server, then reload both lists). Each resolves to an error message, or `''`. Helpers: `update_record`, `place_records`.
- **[use_pointer_drag({ on_start, on_move, on_end })](client/src/hooks/use_pointer_drag.js)**: pointer handlers for dragging with a mouse, pen or finger; captures the pointer and sets `<body data-dragging>` while dragging.
- **[use_viewport_size(viewport_window)](client/src/hooks/use_viewport_size.js)**: the browser window's inner size, updating on resize.
- **[use_element_size(element_ref, box)](client/src/hooks/use_element_size.js)**: an element's size from a `ResizeObserver`, its content box or with `"border"` its whole box (0 by 0 until measured).
- **[use_speech_input(on_transcript, speech_window)](client/src/hooks/use_speech_input.js)**: voice input through the Web Speech API. Returns `{ is_supported, is_listening, error_message, start, stop }`; listens until the student pauses, then calls `on_transcript(text)`. Stops when the component unmounts.
  - Helpers: `get_speech_recognition_class`, `describe_speech_error` (`SPEECH_ERROR_MESSAGES`), `read_transcript`.

**[client/src/utils/format.js](client/src/utils/format.js)**:
- `format_date(iso)`: for example "Oct 24, 2026", in the student's locale.
- `format_character_count(count)`: for example "12.3K characters".
- `get_choice_letter(index)`: 0 → "A".

### Layouts

- **[RootLayout](client/src/layouts/RootLayout.jsx)**: wraps every route with the skip link, `ScrollRestoration` and focus moving. Shows the loading screen when `get_path_area(pathname)` (the first part of the path) changes, and the thin top bar between pages of the same part.
- **[PublicLayout](client/src/layouts/PublicLayout.jsx)**: `PublicNavbar`, then `<main id="main-content">` with a `Suspense` loading screen, then the footer.
- **[DashboardLayout](client/src/layouts/DashboardLayout.jsx)**: on phones, a top bar with a Menu button; then `Sidebar`, then `<main>`, whose centered column starts with `LearningQuizReminder` and `WidgetShelf`; and `AssistantLauncher` in the corner. It runs `start_data_sync()` while open. All of it sits inside `AssistantProvider`. It holds `is_menu_open` for the phone drawer, which closes via the X, the backdrop, Escape or choosing a page.

### Components

- **[button_styles.js](client/src/components/button_styles.js)**: `get_button_classes(variant, extra_classes)` for `primary`, `secondary`, `ghost` and `danger`. Use it on `<button>` and on `<Link>`.
  - Padding in `extra_classes` replaces the default for that axis. `get_default_padding` drops `px-4` when you pass `px-…`, and `py-2.5` when you pass `py-…`.
  - This matters because two padding classes for one axis don't combine reliably in Tailwind.
- **[Logo](client/src/components/Logo.jsx)** `{ to_path }`: the logo and name as a link.
- **[PageTitle](client/src/components/PageTitle.jsx)** `{ page_name }`: sets the tab title via `format_page_title(page_name)`, which gives "Name · StudyApp".
- **[LoadingScreen](client/src/components/LoadingScreen.jsx)** `{ label, is_full_screen }`: the animation with `role="status"`, over the whole screen or (`is_full_screen: false`) in the space it's given.
- **[AlertMessage](client/src/components/AlertMessage.jsx)** `{ tone: 'error' | 'success' }`: an icon plus a message with `role="alert"`.
- **[FormField](client/src/components/FormField.jsx)** `{ field_id, label, value, on_change, error, hint, ...input attributes }`: a labelled input, with its hint and error linked for screen readers.
- **[StepIndicator](client/src/components/StepIndicator.jsx)** `{ current_step, step_count, step_name }`: "Step 1 of 2" plus a `<progress>` bar.
- **[AuthCard](client/src/components/AuthCard.jsx)** `{ title, intro }`: the centered card used by the sign-up and login pages.
- **[PublicNavbar](client/src/components/PublicNavbar.jsx)**: shows About us / Log in / Sign up, or "Go to dashboard" when logged in.
- **[Sidebar](client/src/components/Sidebar.jsx)** `{ sidebar_id, is_open, on_close }`: dashboard links from `DASHBOARD_PAGES`, who is signed in, and Log out (which goes home first, then logs out). `get_nav_link_classes` styles the active link.
- **[RouteGuards](client/src/components/RouteGuards.jsx)**:
  - `get_guest_redirect_path({ from_path, account, offer_learning_quiz })`: where a student goes after signing in. The order is `from_path`, then the quiz (only right after sign-up, if not taken yet), then the dashboard.
  - `RequireAuth`: logged out → `/login`, with `from_path` saved.
  - `RequireGuest { offer_learning_quiz }`: logged in → `get_guest_redirect_path`.

  Both render `<Outlet />` when they allow access.
- **[LearningQuizReminder](client/src/components/LearningQuizReminder.jsx)**: a dashboard banner linking to the quiz, shown until the quiz is taken or **Not now** is pressed on this device.
- **[Dialog](client/src/components/Dialog.jsx)** `{ title, is_open, on_close }`: a popup built on `<dialog>`. It is labelled by its title and closes with the X or Escape. Its children only render while it is open, so forms start fresh each time.
- **[MarkdownContent](client/src/components/MarkdownContent.jsx)** `{ markdown_text }`: renders AI notes with react-markdown, using theme styles. Headings shift down a level (`#` becomes h3) and raw HTML is never rendered.
- **[AiModeNotice](client/src/components/AiModeNotice.jsx)**: the one-line "Practice mode" note (details in a `<details>`), shown while the server uses the mock AI or mock transcription.
- **[SkillPicker](client/src/components/SkillPicker.jsx)** `{ skills, selected_skill_id, on_select, on_add_click }`: the labelled skill dropdown, a color dot, and a "New skill" button (only when `on_add_click` is given; the Learn page leaves it out).
- **[CreateSkillDialog](client/src/components/CreateSkillDialog.jsx)** `{ is_open, on_close, on_created }`: the name and color form (`CreateSkillForm`).
- **[AddResourceDialog](client/src/components/AddResourceDialog.jsx)** `{ skill, topics, is_open, on_close, on_added }`: the "Add a resource" popup. It offers three modes (upload a file, add a link, type or paste notes) as visually hidden radio buttons styled as cards, plus "Topic (optional)" when the skill has topics.
  - `AddResourceForm { skill, topics, fixed_topic, on_added }`: the form itself, also used inside `TopicDialog` with `fixed_topic` (no topic choice shown).
  - `check_selected_file(file)`: blocks uploads over 25 MB before they're sent.
  - `submit_resource(skill_id, mode, form_values)`: picks the endpoint for the chosen mode and sends `topic_id` when one is chosen.
- **[ResourcesPanel](client/src/components/ResourcesPanel.jsx)** `{ skill, resources_state, topics, on_resource_added, on_resource_deleted }`: the resource list (type icon and label, size, date, topic, a "Quiz me" link, delete) and the Add resource button. The page owns the list, because the topic popup shows and changes it too.
  - `describe_added_resource(resource)`: the success message, which mentions truncation when it happened.
- **[TopicGenerator](client/src/components/TopicGenerator.jsx)** `{ field_id, button_label, busy_label, has_resources, on_generate, extra_fields }`: the shared "topic + Generate" form. Without resources it says the AI will use general knowledge.
- **[VoiceInputButton](client/src/components/VoiceInputButton.jsx)** `{ on_transcript, idle_label, speech_window }`: the microphone button (with "Listening…" and errors announced). Renders nothing where speech recognition isn't available.
- **[NotesPanel](client/src/components/NotesPanel.jsx)** `{ skill }`: makes notes and lists them as expandable `<details>` blocks (the newest opens), rendered with `MarkdownContent`.
- **[QuizzesPanel](client/src/components/QuizzesPanel.jsx)** `{ skill }`: makes quizzes (with a question count) and lists them. A quiz's questions load the first time it's opened, and each quiz has a "Take this quiz" link to the Quiz page. `QuizQuestionList` shows the questions with lettered choices.

**Skill map ([components/topic_map/](client/src/components/topic_map/))**
- **TopicMapSection** `{ skill, topic_map_state, resources, on_resource_added, on_resource_updated, on_resources_moved, media_window }`: the overview, the map beside `TopicPanel` (wide screens, via `use_media_query(WIDE_LAYOUT_QUERY)`) or with `TopicDialog` (narrower), suggestions and the topic tools. Holds which topic is open and where the map is centred. After a removal it opens the parent and asks for the resources again.
- **SkillOverview** `{ topics, resource_count }`: the summary card. `compute_level_shares(counts)` sizes the bar.
- **TopicMap** `{ skill, topics, suggestions, selected_topic_id, focus_topic_id, on_focus_change, on_open_topic }`: Map/Outline switch, "Levels shown" (`build_detail_options`), the "Map centred on" path (`FocusPath`) and `MapView` (SVG rings and curved links behind absolutely positioned buttons, both from `compute_topic_map_layout`). Phones always get the outline.
- **TopicNode** `{ topic, position, depth, is_suggested, is_selected, is_crowded, hidden_count, on_open }`: a colored circle with the level's icon, sized by level (`get_node_size`), the name and (unless crowded) the level in words, a "Next" tag, and a "+N" badge for hidden subtopics. `aria-pressed` marks the open topic.
  - `describe_topic_button(topic, is_suggested, hidden_count)` gives the screen reader name, e.g. "Cells: Needs work · 30%. Suggested next. 2 more subtopics. Open topic".
- **TopicOutline** `{ topics, suggested_ids, selected_topic_id, on_open_topic }`: the folder view. Helpers: `describe_outline_row`, `get_initially_expanded_ids`.
- **TopicPanel** / **TopicDialog** `{ topic, on_close, ...TopicDetails props }`: the details beside the map, or in a popup. The panel's sections use h4 headings, the popup's h3.
- **TopicDetails** `{ skill, topic, topics, resources, section_heading, on_select_topic, on_resource_added, on_resource_updated, on_topics_changed, on_topic_map_changed, on_topic_deleted, on_focus_map }`: the path (`TopicPath`), level and branch summary (`describe_branch_levels`), study links, then:
  - **TopicSubtopics**: the subtopics, "Add a subtopic", and "Break into subtopics with AI" (hidden at the deepest level).
  - **TopicResources**: the resources (Quiz me, Take out), Move here, and Add a new resource.
  - **TopicEditor**: rename, "Part of" (only places outside its own branch, indented by level) and Remove topic. `build_topic_updates` sends only what changed.
- **StudyNextPanel** `{ suggestions, has_topics, on_open_topic }`: suggestion cards with "Quiz me on …" buttons. When every topic is strong, it says so.
- **MasteryLegend** `{ counts }`: the key, with the icon, name and meaning of each level, and how many topics are at each when `counts` is given.
- **TopicManager** `{ skill, topics, on_topic_map_changed, on_topic_added }`: "Find topics in my resources" (or "Suggest topics for …" without resources), and "Add a topic", where "Part of" lists every topic indented by level.

**Teach the AI student ([components/teach/](client/src/components/teach/))**
- **TeachSetup** `{ initial_skill_id, initial_topic_id, on_started, on_open_lesson }`: skill, topic (any level, or typed; `build_lesson_details`, `CUSTOM_LESSON_TOPIC`), Start teaching Pip, then `LessonHistory`.
- **LessonHistory** `{ skill_id, on_open }`: past lessons with `describe_lesson_status`, Review / Continue, Delete.
- **TeachLesson** `{ teach_session, on_session_changed }`: the header with progress, the lesson as a `ChatThread` (`to_chat_messages`; "You" and "Pip"), `ChatComposer` labelled "Your explanation" with voice input, and "Finish and quiz us both" with a question count.
- **TeachQuiz** `{ teach_session, feedback_timing, on_graded }`: `QuizRunner` sending answers to the lesson (`submit_answers`).
- **TeachResults** `{ teach_session, topic, on_teach_again, on_back }`: three `ScoreCard`s, Pip's note, and the side-by-side review (`describe_answer_outcome`).
- **ScoreCard** `{ label, score, detail, icon, is_highlighted }`.
- **AiStudentResults**: the Quiz page's list of recent lessons with score bars.
- `ChatThread` takes `assistant_label`, `ChatComposer` takes `label`, `max_length` and `send_label`, and `QuizRunner` takes `submit_answers`, so the lesson reuses them.

**Quizzes ([components/quiz/](client/src/components/quiz/))**
- **QuizWorkspace** `{ initial_quiz_id, initial_skill_id, initial_topic_id, initial_resource_id, feedback_timing, on_finished }`: runs setup, then running, then results. "New quiz on this topic" makes a fresh quiz covering the same thing (`build_retake_details(quiz)`).
- **QuizSetup** `{ initial_skill_id, initial_topic_id, initial_resource_id, on_quiz_ready }`: choose the skill, "What to quiz on" (everything in the skill, a topic with its level, one resource, or "Type my own topic…") and the question count.
  - Choice values: `WHOLE_SKILL_CHOICE`, `CUSTOM_TOPIC_CHOICE`, `topic_choice(id)` ("topic:<id>"), `resource_choice(id)` ("resource:<id>").
  - `get_initial_choice`, `is_available_choice`, and `build_quiz_details(choice, custom_topic, question_count)`, which builds the request with its `scope`.
- **QuizRunner** `{ quiz, feedback_timing, on_graded }`: one question at a time, with a progress bar.
  - With `after_each`: Check answer, then the answer is locked and feedback shown (with a correct or incorrect icon plus words).
  - With `at_end`: Back and Next, with a confirmation before finishing with skipped questions. `count_unanswered` counts them.
- **QuizResults** `{ quiz, graded, on_retake }`: the score and its bar, the topic's new level, and a review of each question (outcome icon and word, the student's answer, the right answer and why).
  - Helpers: `get_question_outcome`, `describe_choice`.
- **RecentResults** `{ skill_id, refresh_key }`: the latest scores with bars.

**Schedule ([components/schedule/](client/src/components/schedule/))**
- **WeekCalendar** `{ week_start, events, today, on_edit_event, on_delete_event }`: seven day rows (Today is highlighted), each with its events in start-time order.
- **EventCard** `{ event, on_edit, on_delete }`: a subject color stripe and name, the time, the title, and buttons for Start work block (`build_work_block_path(event_id)`), Edit and Remove.
- **EventDialog** `{ is_open, event, skills, default_date, on_close, on_saved }`: adds or edits an event.
  - `build_initial_event_values` and `build_event_request`: the date and time inputs are turned into ISO times in the student's time zone.
- **PlanWeekDialog** `{ is_open, proposals, account, on_close, on_added }`: a checklist of planner suggestions, saved one by one.
- **SubjectColorsPanel** `{ skills, on_color_saved }`: a color picker per subject, saved with a Save button (dragging a color picker would otherwise send many requests).

**Learn ([components/learn/](client/src/components/learn/))**
- **LearnTabs** `{ skill_id, current_tab }`: the tab links, scrolling sideways on narrow screens. `LEARN_TABS`, `DEFAULT_LEARN_TAB` (`path`), `find_learn_tab(tab_id)`.
- **LearningPathPanel** `{ skill, on_lesson_started, on_open_lesson }`: "Build my learning path" (or "Reorder my path"), done count and bar, and each step (`PathStep`) with its status, reason and Start / Continue lesson, Practise and Quiz me. Helpers: `PATH_STATUS_DETAILS`, `count_done_steps`, `get_lesson_action(path_step)`, `describe_new_topics`.
- **LessonsPanel** `{ skill, initial_topic_id, on_started, on_open }` and **PracticePanel** `{ skill, initial_topic_id, on_created, on_open }`: a `LearnTopicForm` and a `SavedActivityList`. `describe_lesson_progress`, `describe_practice_progress`.
- **LearnTopicForm** `{ skill, form_id, heading, initial_topic_id, count_field, count_label, count_limits, submit_label, busy_label, on_submit }`: a topic (any level, or typed) and a count; picks the first topic once loaded. `list_count_options(limits)`.
- **SavedActivityList** `{ items_state, noun, empty_text, describe, get_open_label, on_open, delete_item }`: saved lessons or practice, each with open and delete.
- **GuidedLessonView** `{ lesson, on_lesson_changed }`: progress, earlier steps folded away (`FinishedSteps`), the current `LessonStep` (explanation, example, `ExplainAnotherWay`, `LessonCheck`s), then "Explain it another way" and the next button; `LessonSummary` when finished. `describe_step_outcome(step)`, `get_next_label(lesson, is_correct)`.
- **PracticeView** `{ practice_set, on_changed }`: `WorkedExample`, then a `PracticeProblem` each (answer box, hints, earlier answers with feedback, solution). `describe_hint_count`.
- **ReadingList** `{ skill, on_open }` (`describe_reading_progress`) and **ReadingView** `{ resource_id }`: section picker, progress, `ReadingSection` (text, `SectionGuide`, `ExplainAnotherWay`, `PassageExplainer`) and Previous / Next, which save the place. `read_selected_passage(container, selection)`.
- **GlossaryPanel** `{ skill }`: Find key terms, `AddTermForm`, search and the list (`<dl>`). `filter_glossary_terms`, `describe_added_terms`, `insert_term_in_order`.
- **TopicKeyTerms** `{ skill_id, topic_id, Heading }`: one topic's terms, in its details on the skill map.
- **ExplainAnotherWay** `{ skill_id, text, topic_id }`: the four style buttons (`EXPLAIN_STYLE_DETAILS`) and the answer. Used on lesson steps, reading sections, notes and topic summaries.

**Assistant ([components/assistant/](client/src/components/assistant/))**
- **AssistantLauncher**: the round Assistant button (`aria-expanded`, `aria-keyshortcuts`), and the panel, downloaded and built the first time it opens. Focus returns to the button when the panel closes. Ctrl+K or Cmd+K (`is_assistant_shortcut(event)`) opens and closes it.
- **AssistantPanel**: the non-modal dialog with the Chat and Widgets tabs (`PANEL_TABS`, a `tablist`); Escape or the X closes it.
- **AssistantChat** `{ is_visible }`: the AI choice (with its description), Clear, the conversation (`AssistantMessage`), starter requests (`STARTER_REQUESTS`) when empty, and `ChatComposer`. Sending shows the message at once, puts it back on failure, opens pages from `client_actions` and calls `notify_data_changed()` when data changed. Helpers: `add_exchange`, `replace_message`.
- **AssistantActions** `{ message, busy_action_id, on_confirm, on_cancel }`: what a reply did (`ACTION_STATUS_DETAILS`), with Open links, Confirm / Cancel for pending ones, and any widget made.

**Widgets ([components/widgets/](client/src/components/widgets/))**
- **WidgetShelf** `{ media_window }`: the docked items on this page in a six-column grid (downloaded only when there are some). It moves items (keys, menu, and dragging with `find_drop_side` and `drop_beside`), stacks two dropped on each other, saves the order, and has Collapse all / Expand all. `WidgetDescriptions` explains the grip and corner to screen readers.
- **FloatingWidgets** `{ media_window, viewport_window }`: the floating items, in a layer over the page's column that lets clicks through. `get_bounds(anchor)` is the screen beside the sidebar, or the column; touching a window brings it to the front.
- **WidgetWindow** `{ item, placement, id_prefix, page, docked, floating, stack_item }`: one widget or stack in a window, `"docked"`, `"floating"` or `"panel"` (the assistant's Widgets tab and chat: content and menu only). Title-bar dragging, resizing (`DOCKED_RESIZE_DIRECTIONS`, `FLOATING_RESIZE_DIRECTIONS`), the grip and corner keys, the size badge (`format_size_badge`), its look and accent (`data-accent`), its icon tile (`pick_item_icon`), the control capsule with the Float/Dock button, and its measured shape (`data-size`, `data-orientation`), passed to its content. Changes go through `use_widget_actions`.
- **WidgetMenu** `{ item, frame_id, placement, can_float, page_controls, other_items, stack_item, handlers }`: the ⋯ menu in sections (`LayoutSection`, `StackSection`, where it shows with **Customize…** and **Hide**, `RenameForm`), opened where there's room (`place_menu`). Escape closes it without closing the assistant around it.
- **CustomizeSheet** `{ item, layout, frame_id, side, can_change_pages, on_look_change, on_pins_change, on_hidden_change, on_close }`: the Customize panel (`SheetSection`, `PagesSection`; see [Customizing widgets](#customizing-widgets-looks-pages-and-hiding)).
- **WidgetControls**: `SegmentedControl`, `AccentPicker` and `SliderField` (a labelled range input with its value shown).
- **WidgetControls**: `SegmentedControl` (a radio group drawn as one pill) and `AccentPicker` (color swatches, each named for screen readers).
- **WidgetHandles**: `MoveHandle` (the grip, for the keyboard; `MOVE_KEY_OFFSETS`), `ResizeHandles` (an invisible grab area on each edge and corner, and the visible corner grabber for the keyboard), `SHOW_ON_HOVER`.
- **StackView** `{ stack_item, id_prefix, fixed_height, shape, accent, on_select, on_state_change }`: a stack's content, "swipe" (a snapping track with a pager pill of arrows and accent dots; the widget a swipe settles on is saved after `STACK_SCROLL_SETTLE_MS`) or "list" (title tabs in a segmented pill).
- **WidgetView** `{ widget, id_prefix, fixed_height, shape, accent, on_state_change }`: a card's blocks, or an app (`AppWidget`) in a see-through sandboxed `<iframe>`. The app gets the design kit in the current theme and the widget's accent, is sent the widget's shape on load and on every change (`APP_SHAPE_MESSAGE`), resizes to the height its own frame reports (`APP_HEIGHT_MESSAGE`, kept within limits), and saves the data the app keeps with `kit.save` (`APP_SAVE_MESSAGE`, as `state.app`, after `APP_SAVE_DELAY_MS`; the page is built with the saved data once, so a save never reloads it).
- **GlassRefraction** `{ filter_id, width, height }`: the SVG filter that bends the page at a glass window's edges (see [Finished widgets](#finished-widgets-glass-the-app-kit-and-better-ai-widgets)).
- **WidgetBlocks**: one component per block type (markdown, checklist, countdown, timer with `TimerRing`, flashcards, links, live), each laid out for the widget's `shape` (`DEFAULT_SHAPE` outside a widget; see the table in [Widget windows](#widget-windows-and-smart-stacks)). `IconButton` is the round control used inside widgets; `describe_live_detail(item)` writes a live item's detail and time.

**Chat ([components/chat/](client/src/components/chat/))**: shared by the lesson and the assistant.
- **ChatThread** `{ messages, pending_question, assistant_label }`: a lesson's conversation in a focusable, scrolling `role="log"` region ("You" / the AI student, replies in Markdown), with "Thinking…" while a reply comes.
- **ChatComposer** `{ draft, set_draft, is_sending, on_send, field_id, label, max_length, send_label }`: the message box (Enter sends, Shift+Enter adds a line), Send, and `VoiceInputButton`. Helpers: `append_spoken_text`, `is_send_key`.

**Settings ([components/settings/](client/src/components/settings/))**
- **AccountForm** `{ form_id, fields, initial_values, build_updates, describe_success, values_after_save, on_saved }`: one form for part of the account. `fields` are `[{ name, label, type?, autoComplete?, hint?, min?, max? }]`. `build_updates(values)` returns `{ updates, field_errors }`; nothing to send shows "Nothing has changed." It sends `update_account`, shows server `field_errors` under their fields and a success message, then calls `on_saved(account)`.
- **[account_updates.js](client/src/components/settings/account_updates.js)**: what each form sends (only changed fields).
  - `build_profile_updates(values, account)`: names and username, trimmed.
  - `build_sign_in_updates(values, account)`: new email and/or password; the passwords must match, and `current_password` is added.
  - `build_timer_updates(values, account)`: the two lengths as numbers (blank → `null`, so the server explains the limits).
  - `describe_sign_in_success(updates)`: the saved message, which says other devices were logged out after a new password.
- **AppearanceSettings**: the Match my device / Light / Dark radio group (`THEME_CHOICES`).
- **LearningProfileSettings** `{ account, on_saved }`: the saved answers in words (`describe_answer(question, answer)`, or `NOT_ANSWERED`), and the `LearningQuizForm` to retake or take the quiz.
- **DeleteAccountSection** `{ on_deleted }`: "Delete my account" opens a `Dialog` listing `DELETED_ITEMS`, with a password field, "Delete my account" and "Keep my account".

**Progress ([components/progress/](client/src/components/progress/))**
- **StatTile** `{ label, value, detail, change }`: one headline number; `change` is `{ direction, text }` from `describe_change`, always in words plus an icon.
- **StudyTimeChart** `{ work_blocks, now }`: the daily focus columns (`group_minutes_by_day`), a hover value per column, a `role="img"` summary (`describe_study_time`) and a table view in `<details>`. With no focus time it shows a "Start a work block" link instead. `get_axis_top(day_minutes)` rounds the busiest day up to a clean axis top.
- **SkillProgressList** `{ skills }`: per skill, "Topics quizzed" and "Topics strong" bars and `describe_skill_facts` ("4 topics · 2 resources · average 67%").
- **TopicChanges** `{ topic_changes }`: "Most improved" and "Worth another look", each with first and latest score and the change in words.

**Work blocks**
- **[WorkBlockTimer](client/src/components/work_block/WorkBlockTimer.jsx)** `{ work_block, on_focus_complete, on_end_early }`: redraws every second through `use_now`, and updates the tab title with the countdown.
  - The countdown is a `role="timer"` region; phase changes go to a separate status message.
  - It chimes on each phase change, and calls `on_focus_complete` once when the focus period ends.
- **[QuizQuestionField](client/src/components/QuizQuestionField.jsx)** `{ question, answer, error, on_change }`: one quiz question. `single` is a radio group in a `<fieldset>`, `multiple` is checkboxes, `text` is a textarea.
- **[LearningQuizForm](client/src/components/LearningQuizForm.jsx)** `{ questions, initial_answers, submit_label, on_submit }`: the whole quiz. It shows `field_errors` from a failed `on_submit` under the matching questions. Settings reuses it to retake the quiz.

### Pages

- **[HomePage](client/src/pages/HomePage.jsx)**: hero with calls to action, How it works, About us (`#about`) with account benefits. The text lives in the `HOW_IT_WORKS_STEPS` and `ACCOUNT_BENEFITS` arrays. `StartLink { is_signed_in }` is "Create a free account", or "Go to your dashboard" for a signed-in student.
- **[SignUpPage](client/src/pages/SignUpPage.jsx)**: step 1. Checks the username when the field loses focus (`check_username_available`), has a show-password toggle, and shows server `field_errors` under each field.
- **[LoginPage](client/src/pages/LoginPage.jsx)**: email and password. "Incorrect email or password" appears as an alert. `SIGN_OUT_NOTES` explains a session that ended or a logout in another tab.
- **[LearningQuizPage](client/src/pages/LearningQuizPage.jsx)**: step 2. Fetches the questions, saves the answers, calls `set_account`, then goes to `/dashboard`. **Skip for now** goes straight to the dashboard.
- **[dashboard/SkillMapPage](client/src/pages/dashboard/SkillMapPage.jsx)**: loads the skills, keeps the chosen one in `?skill=`, and shows `SkillSections` for it. It also offers "Add your first skill" when there are no skills, and Delete skill.
  - `SkillSections { skill, on_resource_count_change }`: loads the topic map and the resources once and shares them between `TopicMapSection` and `ResourcesPanel`, then `NotesPanel` and `QuizzesPanel`.
  - `change_resource_count(skills, skill_id, delta)`, `replace_resource(resources, updated_resource)`.
- **[dashboard/QuizPage](client/src/pages/dashboard/QuizPage.jsx)**: "Your quiz" (a `QuizWorkspace` set up from `?quiz`, `?skill&topic` or `?skill&resource`), "AI student's quiz" (`AiStudentResults`), and "Recent results" for the quiz's skill, which refreshes after each grade.
- **[dashboard/SchedulePage](client/src/pages/dashboard/SchedulePage.jsx)**: week navigation (previous, next, this week), Add event, Plan my week (runs `plan_study_week` with the account's answers and `work_minutes`), the calendar and subject colors.
- **[dashboard/WorkBlockPage](client/src/pages/dashboard/WorkBlockPage.jsx)**: loads any running block (`fetch_active_work_block`) and the `?event` event.
  - Shows the "During this block I will" dropdown (`ACTIVITY_OPTIONS`), Start work block, the timer, and `ActivityPanel` (the assignment card, or a `QuizWorkspace` on the event's subject).
  - Records the block when focus ends or when the student ends it early, then offers "Start another block".
- **[dashboard/LearnPage](client/src/pages/dashboard/LearnPage.jsx)**: the skill picker and tabs, or one lesson, practice set or resource from the address (see [Pages and navigation](#pages-and-navigation)). `open_activity(ids, item)` keeps `?skill` and `?tab` so "Back" returns to the tab; a lesson or practice set just made is shown without loading it again (`SavedActivity`).
- **[dashboard/TeachPage](client/src/pages/dashboard/TeachPage.jsx)**: loads the `?session=` lesson and shows the stage it's at (setup, lesson, quiz or results). `build_repeat_lesson_details` makes "Teach this topic again" use the same map topic.
- **[NotFoundPage](client/src/pages/NotFoundPage.jsx)**: shown for unknown addresses.

### Services

**[client/src/services/api_client.js](client/src/services/api_client.js)**
- `build_request_headers(is_json, access_token)`: JSON and Authorization headers as needed.
- `api_request(path, { method, body, access_token })`: calls `API_BASE_URL + path`.
  - A plain-object `body` is sent as JSON; a `FormData` body is sent as a file upload, letting the browser set its content type.
  - Returns parsed JSON (`null` for 204).
  - On failure it throws an `Error` with the server's message, `status` and `field_errors`.

**[client/src/services/skill_service.js](client/src/services/skill_service.js)**: `fetch_skills`, `create_skill(details)`, `update_skill(id, updates)`, `delete_skill(id)`.

**[client/src/services/resource_service.js](client/src/services/resource_service.js)**:
- `fetch_resources(skill_id)`.
- `upload_resource_file(skill_id, file, title, topic_id)`: sent as `FormData`; an empty title or topic is left out.
- `add_resource_link(skill_id, { url, title, topic_id })`, `add_resource_text(skill_id, { title, text, topic_id })`.
- `move_resource_to_topic(resource_id, topic_id)`: `PATCH`; `null` takes it out of its topic.
- `delete_resource(id)`.

**[client/src/services/study_material_service.js](client/src/services/study_material_service.js)**:
- Notes: `fetch_notes`, `generate_notes(skill_id, topic)`, `delete_note`.
- Quizzes: `fetch_quizzes`, `generate_quiz(skill_id, { topic, question_count })`, `fetch_quiz`, `delete_quiz`.
- `fetch_ai_status`.
- Quizzes on the Quiz page: `check_answer(quiz_id, question_index, answer_index)`, `submit_quiz_answers(quiz_id, answers)`, `fetch_recent_results(skill_id)`.
- `generate_quiz` takes the body described under [quiz scopes](#topics-and-quiz-scopes-phase-6).

**[client/src/services/assistant_service.js](client/src/services/assistant_service.js)**: `fetch_assistant`, `send_assistant_message(message, page_path)` (adds `get_utc_offset_minutes()`), `clear_assistant`, `choose_assistant`, `confirm_assistant_action`, `cancel_assistant_action`.

**[client/src/services/widget_service.js](client/src/services/widget_service.js)**: `fetch_widgets`, `update_widget(id, { title?, state?, pinned_paths?, layout? })`, `order_widgets(items)`, `delete_widget`, `fetch_widget_stacks`, `create_widget_stack`, `update_widget_stack`, `delete_widget_stack`, `fetch_live_widget_data(source, skill_id?)`.

**[client/src/services/topic_service.js](client/src/services/topic_service.js)**: `fetch_topic_map`, `add_topic(skill_id, { topic, parent_topic_id })`, `generate_topics`, `update_topic(topic_id, updates)`, `generate_subtopics(topic_id)`, `delete_topic`.

**[client/src/services/learning_service.js](client/src/services/learning_service.js)**: one function per learning route: `fetch_learning_path`, `build_learning_path`; `fetch_guided_lessons`, `start_guided_lesson`, `fetch_guided_lesson`, `answer_lesson_check`, `reteach_lesson_step`, `go_to_next_step`, `delete_guided_lesson`; `fetch_practice_sets`, `create_practice_set`, `fetch_practice_set`, `show_practice_hint`, `show_practice_solution`, `check_practice_answer`, `delete_practice_set`; `fetch_reading_list`, `fetch_reading`, `fetch_reading_section`, `guide_reading_section`, `save_reading_position`, `explain_reading_passage`; `fetch_glossary`, `add_glossary_term`, `generate_glossary`, `delete_glossary_term`; `explain_another_way`.

**[client/src/services/teach_service.js](client/src/services/teach_service.js)**: `fetch_teach_sessions(skill_id?)`, `start_teach_session`, `fetch_teach_session`, `send_teaching_message`, `start_lesson_quiz(id, question_count)`, `submit_lesson_answers(id, answers)`, `delete_teach_session`.

**[client/src/services/schedule_service.js](client/src/services/schedule_service.js)**:
- Events: `fetch_events(from, to)` (Dates), `fetch_event`, `create_event`, `update_event`, `delete_event`.
- Work blocks: `start_work_block`, `fetch_active_work_block` (the block or `null`), `finish_work_block(id, { completed_minutes, activity })`.

### Utilities

- **[config/mastery.js](client/src/config/mastery.js)**:
  - `MASTERY_LEVEL_DETAILS`: label, icon, node colors and description per level.
  - `MASTERY_LEVEL_ORDER`, `describe_mastery(topic)` ("Needs work · 30%").
  - `QUIZ_FEEDBACK_TIMING`, `get_feedback_timing(account)`.
- **[utils/topic_map_layout.js](client/src/utils/topic_map_layout.js)**:
  - `compute_topic_map_layout(topics, visible_depth, focus_topic_id)` returns `{ center, rings, nodes, links }` in percentages: one ring per level, each topic inside its parent's slice.
  - Helpers: `point_on_ring`, `compute_ring_radii(level_count, first_ring_count)`, `count_visible_leaves`, `get_slice_weight` (square root of the leaves), `select_focused_topics`, `is_ring_crowded`, `spread_crowded_rings`, `build_link_path` (the curved links).
- **[utils/topic_tree.js](client/src/utils/topic_tree.js)**: `build_topic_tree` (nodes with `depth` and `children`; missing parents and loops become main topics), `flatten_topic_tree`, `get_tree_depth`, `list_branch_topic_ids` (like the server), `list_child_topics`, `list_topic_path`, `count_mastery_levels`, `count_branch_levels`, `list_possible_parents`, `list_topic_resources` (adds `in_subtopic`), `find_topic_name`, `format_indented_name` ("— — Prophase" for dropdowns).
- **[utils/study_paths.js](client/src/utils/study_paths.js)**: `build_quiz_path({ skill_id, topic_id, resource_id })`, `build_teach_path({ skill_id, topic_id, session_id })`, `build_learn_path({ skill_id, tab, topic_id, lesson_id, practice_id, resource_id })` and its query keys `LEARN_PARAMS`.
- **[hooks/use_media_query.js](client/src/hooks/use_media_query.js)**: `use_media_query(query, media_window)`, true while a CSS media query matches (false without `matchMedia`, as in tests).
- **[utils/skill_selection.js](client/src/utils/skill_selection.js)**: `SELECTED_SKILL_PARAM`, `remember_skill_id(skill_id)` and `find_selected_skill(skills, requested_id)` (the requested skill, else the last one chosen on this device, else the first), shared by the Skill map, Learn, Quiz and Teach pages.
- **[utils/device_storage.js](client/src/utils/device_storage.js)**: `read_device_value(key)` and `save_device_value(key, value)`, which quietly do nothing where the browser blocks storage.
- **[utils/theme.js](client/src/utils/theme.js)**: `THEME_CHOICES`, `DEFAULT_THEME_CHOICE`, `DARK_SCHEME_QUERY`, `read_theme_choice()`, `resolve_theme(choice, prefers_dark)`, `apply_theme(theme, root_element)`.
- **[utils/dates.js](client/src/utils/dates.js)**:
  - Week and day helpers: `start_of_week` (Monday), `add_days`, `get_week_days`, `is_same_day`, `get_events_on_day`.
  - Form helpers: `to_date_input_value`, `to_time_input_value`, `combine_date_and_time`.
  - Display: `format_day_heading`, `format_time_range`, `format_week_range`.
- **[utils/study_planner.js](client/src/utils/study_planner.js)**:
  - `plan_study_week({ week_start, now, learning_profile, skills, events, session_minutes })`.
  - Helpers: `get_plan_preferences`, `rank_skills_for_planning`, `list_candidate_starts`, `overlaps_any`.
  - Tables: `WEEKLY_STUDY_MINUTES`, `STUDY_TIME_START_HOURS`.
- **[utils/work_block_timer.js](client/src/utils/work_block_timer.js)**:
  - `get_timer_state({ started_at, planned_minutes, break_minutes, now })` returns `{ phase, seconds_left, focused_minutes }`.
  - `format_countdown`, `describe_phase_change`.
- **[utils/progress.js](client/src/utils/progress.js)**: `format_minutes` ("1 h 25 min"), `format_points` ("8 points"), `describe_change(change, period_days, format_amount)` → `{ direction, text }` ("Up 8 points on the 30 days before", "The same as the 7 days before", or "Not enough yet to compare with an earlier period"), `group_minutes_by_day(work_blocks, now, day_count)` (local days, oldest first).
- **[utils/widget_layout.js](client/src/utils/widget_layout.js)**: items (a widget or a stack: `get_item_key`, `to_widget_item`, `to_stack_item`, `build_layout_items`, `find_stack_item`, `find_active_member`, `list_item_widgets`, `get_item_title`, `split_page_items(items, pathname, can_float)`, `sort_shelf_items`); widths and looks (`WIDGET_WIDTH_DETAILS`, `WIDGET_APPEARANCE_DETAILS`, `WIDGET_ACCENT_DETAILS`, `find_width_details`, `find_appearance_details`, `step_width`, `width_from_columns`, `clamp_content_height`, `describe_size(layout, floating_size)`, `WIDGET_CONTENT_SIZE_DETAILS`, `describe_shape(box, { is_height_fixed, content_size })`); docked order (`move_by`, `drop_beside`, `find_drop_side`, which also finds an item's "center"); floating geometry (`clamp_float_rect`, `snap_float_rect`, `RESIZE_DIRECTIONS`, `resize_float_rect`, `place_new_float`), where bounds may start beside the sidebar (`left`, `top`).
- **[utils/widgets.js](client/src/utils/widgets.js)**: `APP_WIDGET_POLICY` and `build_app_document(html, theme, accent, state)` (the sandboxed app's page: the policy first, the design kit from `build_app_styles(theme, accent)` with `APP_COLORS` and `APP_ACCENTS`, `window.kit` started with the saved data, which also takes the widget's shape from `APP_SHAPE_MESSAGE`, and a script reporting its height as `APP_HEIGHT_MESSAGE`, first in the body; `APP_SAVE_MESSAGE` and `APP_STATE_MAX_LENGTH` for saves), `clamp_widget_height(height)`, `get_page_path`, `is_pinned_here(pinned_paths, pathname)`, `describe_pins` ("Learn and Quiz"), `toggle_pinned_page`, `list_dashboard_paths`, `get_checked_items`, `toggle_checked_item`, `split_seconds`, `split_countdown(target, now)` (whole days, hours, minutes and seconds), `pick_countdown_units`, `describe_countdown(target, now)` (in words), `describe_countdown_end`, `format_clock(seconds)` ("25:00"), and timers' `read_timer` and `save_timer`.
- **[utils/widget_layout.js](client/src/utils/widget_layout.js)** also has the look: `WIDGET_CORNER_DETAILS`, `WIDGET_SHADOW_DETAILS`, `WIDGET_GLASS_TINT_DETAILS`, `build_look_style(layout)`, `build_glass_filter(layout)` and `get_corner_radius(layout)`.
- **[utils/app_kit.js](client/src/utils/app_kit.js)**: `install_app_kit(app_window, config)`, the `window.kit` every app widget's page gets (`calc`, `format`, `units`, `convert`, `save`, `load`, `size`, `on_size`; see [Finished widgets](#finished-widgets-glass-the-app-kit-and-better-ai-widgets)). It's copied into the page as source, so it uses nothing from outside itself.
- **[utils/glass.js](client/src/utils/glass.js)**: `can_refract_backdrop(navigator)` (Chromium only), `measure_rounded_edge(x, y, width, height, radius)` (how far inside and which edge is nearest), `build_displacement_pixels(width, height, radius, bevel)` and `render_displacement_map(width, height, { radius, bevel, resolution })` (the map as a data: URL).
- **[utils/data_events.js](client/src/utils/data_events.js)**: keeping data in step (see [Keeping everything in step](#keeping-everything-in-step)).
  - `DATA_CHANGED_EVENT`, `notify_data_changed(target)`; `SESSION_ENDED_EVENT`, `notify_session_ended(target)`.
  - `announce_data_change()`: a save in this tab, reported here and to other tabs once per burst.
  - `get_sync_channel()`: this tab's `BroadcastChannel`, or `null`.
  - `start_data_sync(now)`: listens for other tabs and for the student coming back to the tab; returns a function that stops.
- **[MarkdownContent](client/src/components/MarkdownContent.jsx)** opens links to the app's own pages in place (router links) and others in a new tab.
- **[utils/chime.js](client/src/utils/chime.js)**: `play_chime()`, two notes made with Web Audio (no sound file). It's skipped silently if the browser blocks audio.
- **[hooks/use_now.js](client/src/hooks/use_now.js)**: `use_now(interval_ms, is_active)`, the current time refreshed on an interval.

**[client/src/services/session_store.js](client/src/services/session_store.js)**
- `read_session_token()`, `save_session_token(token)`, `clear_session_token()`: keep the token in `localStorage`. If the browser blocks storage, the token is kept in memory until the page closes.

**[client/src/services/auth_service.js](client/src/services/auth_service.js)**
- `is_logged_in()`: whether a token is saved.
- `send_authed_request(path, options)`: `api_request` with the token attached. On a 401 it clears the stale token. Every signed-in call goes through this.
- `check_username_available(username)`: `GET /auth/check-username`.
- `sign_up(signup_details)` / `log_in(email, password)`: call the API, save the token and return the account.
- `log_out()`: `POST /auth/logout`, then always clears the token, even if the server can't be reached.

**[client/src/services/account_service.js](client/src/services/account_service.js)**
- `fetch_account()`, `update_account(account_updates)`: `GET` and `PATCH /account`.
- `delete_account(password)`: `DELETE /account` with `{ password }`, then clears the token (only after the server succeeds).

**[client/src/services/progress_service.js](client/src/services/progress_service.js)**: `fetch_progress()`: `GET /progress`.

**[client/src/services/learning_quiz_service.js](client/src/services/learning_quiz_service.js)**
- `fetch_learning_quiz()`: `GET /learning-quiz` → the questions.
- `save_learning_profile(answers)`: `PUT /account/learning-profile` → the updated account.
- `has_learning_profile(account)`: whether the quiz has been answered.
- `build_initial_answers(questions, saved_answers)`: starting form values. Blank (`[]` for multiple choice, `''` otherwise), or the saved answers when retaking.
- `toggle_choice(chosen_values, value)`: adds or removes a checkbox value.

### Test helpers

**[client/tests/helpers/](client/tests/helpers/)**
- `render_helpers.jsx`:
  - `create_auth_value(overrides)`: a fake `use_auth()` value, logged out by default.
  - `render_with_routes(routes, { auth_value, initial_path, initial_state })`: an in-memory router inside the real `ThemeProvider`. `initial_path` may include a query string. It returns `router`, so tests can check `router.state.location`.
  - `render_in_router(element, options)`: renders one element at any path.
- `test_data.js`: `SAMPLE_QUESTIONS`, `TEST_ACCOUNT` (quiz finished), and `NEW_ACCOUNT` (quiz skipped).

[client/tests/setup_tests.js](client/tests/setup_tests.js) fills in two browser features jsdom lacks: `window.scrollTo`, and `<dialog>`'s `showModal`/`close`. The routing test preloads the lazy pages in a `beforeAll`, because compiling them for the first time can take several seconds when many test files run at once.

---

## Style guide

All design values are Tailwind theme tokens in [client/src/styles/theme.css](client/src/styles/theme.css). Use the generated utilities (`bg-brand-600`, `text-ink-muted`, `font-display`, `text-heading-2`) and never raw hex values in components.

| Group | Tokens | Use |
| --- | --- | --- |
| Brand (indigo) | `brand-50 … brand-800` | Primary buttons, links, active nav. White text on 600+ |
| Accent (teal) | `accent-50`, `accent-600`, `accent-700` | Secondary highlights |
| Neutrals | `canvas`, `surface`, `border`, `ink`, `ink-muted` | Page background, cards, lines, text |
| Feedback | `success`, `warning`, `danger`, `success-soft`, `danger-soft` | White text on the solid colors. The `-soft` colors are alert backgrounds, with the matching solid color as text |
| Skill map | `mastery-strong` (green), `mastery-developing` (yellow), `mastery-weak` (red), `mastery-untested` (gray) | Node fill, always paired with an icon and a label |
| Fonts | `font-display` (Lexend), `font-body` (Inter) | Headings / everything else |
| Sizes | `text-caption`, `small`, `body`, `lead`, `heading-3`, `heading-2`, `heading-1`, `display` | Each comes with its own line height |

| Fixed | `brand-deep`, `danger-solid`, `ink-on-light`, `backdrop`, `focus` | The same in both themes: backgrounds behind white text, dark text on the light mastery fills, popup backdrops, the focus ring |

Every text/background pair listed in the CSS comments meets WCAG AA contrast. Keyboard focus shows a 3px outline everywhere.

**Dark mode** redefines the tokens under `:root[data-theme='dark']`, so components never need a `dark:` class. A color that sits behind white text must not be one that becomes light in dark mode: use `brand-600`, `brand-deep` or `danger-solid` for those, not `brand-700` or `danger` (which are text colors).

**Widget accents** are `--widget-accent`, set by `data-accent` on a widget (indigo, teal, sky, green, amber, rose, slate; lighter steps in dark mode). They color only the icon tile by a widget's title, a "tinted" widget's background, a glass widget's wash and the menu swatches, never text, so contrast never depends on them. Inside a widget, soft panels use `--widget-soft` and `--widget-line` (set by `data-appearance`) instead of `canvas` and `border`, so they suit solid, glass and tinted widgets. App widgets get their own copies of the accents (`APP_ACCENTS`), a step darker in light mode so white button text passes AA.

---

## Database

Defined in [server/db/schema.sql](server/db/schema.sql). IDs are UUID text, timestamps are ISO-8601 UTC text, and JSON columns are text checked with `json_valid`. Every student-owned table has `user_id` → `users.id` with `ON DELETE CASCADE`.

| Table | Purpose | Notable columns |
| --- | --- | --- |
| `users` | One per student | `email`, `username` (both unique, case-insensitive), `password_hash`, names, `learning_profile` (JSON), `work_minutes`, `break_minutes`, `assistant_id` (the AI that runs their assistant, `NULL` = default) |
| `sessions` | Logged-in devices | `token_hash`, `expires_at` |
| `skills` | A skill the student is learning; also a schedule "subject" | `name`, `color` (hex) |
| `resources` | Uploaded or linked study material | `skill_node_id` (the topic it's filed under), `resource_type`, `source_url`, `file_path` (inside uploads/), `extracted_text`, `status`, `reading_section` (where active reading is up to) |
| `skill_nodes` | Topics on the skill map | `topic`, `parent_node_id`, `mastery_score` (NULL = gray / untested) |
| `notes` | AI-generated study notes | `topic`, `content` |
| `quizzes` | Multiple-choice quizzes | `scope` (`skill` / `topic` / `resource`), `skill_node_id`, `resource_id`, `questions` JSON: `[{ question, choices, correct_index, explanation }]` |
| `teach_sessions` | One "teach the AI student" lesson | `topic`, `skill_node_id`, `lesson_messages` JSON, `quiz_id`, `combined_score`, `ai_student_reasons` JSON, `teaching_feedback` |
| `quiz_results` | One attempt at a quiz | `taker` (`student` / `ai_student`), `teach_session_id` (for a lesson's quiz), `answers`, `score` 0–100 |
| `events` | Schedule entries | `starts_at`, `ends_at`, `skill_id` (colors the event) |
| `work_blocks` | Pomodoro sessions | `activity` (`quiz` / `assignment`), planned and completed minutes |
| `assistant_messages` | The assistant's conversation, one per student | `role`, `content`, `actions` JSON (with each action's arguments, so a pending one can run later) |
| `widgets` | Widgets and tools the assistant made | `title`, `kind` (`card` / `app`), `spec` JSON, `state` JSON (ticks, timers, an app's data), `pinned_paths` JSON, `layout` JSON (`DEFAULT_WIDGET_LAYOUT`: docked size and place, floating position and size, hidden, and the look) |
| `widget_stacks` | Smart Stacks of widgets | `widget_ids` JSON (in order), `view` (`swipe` / `list`), `active_widget_id`, `pinned_paths` JSON, `layout` JSON |
| `guided_lessons` | One guided lesson | `topic`, `skill_node_id`, `steps` JSON (with every check and answer), `current_step`, `completed_at` |
| `learning_paths` | The learning order for one skill (`skill_id` is the key) | `steps` JSON: `[{ topic_id, reason }]` |
| `practice_sets` | A worked example and problems | `topic`, `skill_node_id`, `worked_example` JSON, `problems` JSON (hints, solution, hints shown, attempts) |
| `reading_guides` | The AI's guide to one section of a resource | `resource_id` + `section_index` (the key), `explanation_markdown`, `think_about` |
| `glossary_terms` | Key terms per skill | `term` (unique per skill, any letter case), `definition`, `skill_node_id` |

**Triggers:** `users_set_updated_at` and `skill_nodes_set_updated_at` keep `updated_at` current.

**Changing an existing table:** `CREATE TABLE IF NOT EXISTS` won't alter a table that already exists. To add a column, add it to the table in `schema.sql` (for new databases) **and** to `ADDED_COLUMNS` in [db/migrations.js](server/db/migrations.js) (for existing ones). Phase 6 added `resources.skill_node_id`, `quizzes.scope` and `quizzes.resource_id` this way, Phase 7 `teach_sessions.ai_student_reasons` and `teaching_feedback`, Phase 9 `resources.reading_section`, and Phase 10 `users.assistant_id`. Databases from before Phase 10 keep an unused `chat_messages` table and `skills.chat_provider` column from the old chatbot; they do no harm, and deleting `server/data/` starts clean.

---

## Conventions

- **snake_case** for variables, functions, hooks, API fields and database columns. React components are PascalCase (`App`) because JSX requires it. Names from libraries (`DatabaseSync`, `createHash`) keep their own casing.
- No hardcoded values: fixed values live in `config/constants.js` (server and client) and design values in `theme.css`.
- Secrets live only in `.env` files, which are git-ignored. `.env.example` lists every variable.
- Media goes in `/assets`. Vite serves it at the site root, so `assets/icons/logo.svg` is `/icons/logo.svg`. Student uploads go in `server/data/uploads/` instead, because they are user data, not app media.
- Every source file has matching tests in `tests/`. Small components and pages with only a few functions share a test file (for example `tests/components/simple_components.test.jsx`).
- Component props are snake_case too (`on_change`, `to_path`). Built-in DOM attributes keep React's names (`onClick`, `autoComplete`).
- The only `console` calls are the startup message and the unexpected-error log in `handle_errors`.

---

## Debugging tips

| Symptom | Likely cause |
| --- | --- |
| `No such built-in module: node:sqlite` | Node is older than 22.13. Upgrade Node |
| Sign-up or any request returns 500 "Something went wrong" | Check the server terminal for the real error |
| `database is locked` | Another program (OneDrive sync, a DB viewer with unsaved edits) has the file open |
| A new column isn't there | It's in `schema.sql` but not in `ADDED_COLUMNS` in `db/migrations.js`, so older databases never got it. Add it there and restart |
| Every signed-in request returns 401 | The session expired or was logged out, or `server/data/` was deleted. Log in again |
| CORS error in the browser console | `CLIENT_ORIGIN` in `server/.env` does not exactly match the site's URL |
| Deleted a user but their rows remain | The database was opened without `open_database`, so `PRAGMA foreign_keys` is off |
| Website shows "Request failed" or "Failed to fetch" on sign-up | The API isn't running. `npm run dev` from the root starts both servers |
| Always sent back to the learning quiz | `learning_profile` is still `{}`. Check that `PUT /api/account/learning-profile` returned 200 in the browser's Network tab |
| Stuck on the loading screen | `GET /api/account` never answered. Check that the API is running and that `VITE_API_URL` is correct |
| The quick loading flash between pages is annoying | Set `PAGE_TRANSITION_MS` to `0` in `client/src/config/constants.js` |
| Dark mode, the remembered skill or "Not now" don't stick | They're saved in the browser. Private windows and blocked site data forget them when the page closes |
| White text is hard to read on something in dark mode | It uses a text token (`brand-700`, `danger`) as a background. Use `brand-600`, `brand-deep` or `danger-solid` (see [Style guide](#style-guide)) |
| A page didn't update after a change in another tab | The browser has no `BroadcastChannel` (very old browsers). Coming back to the tab after 30 s still refreshes it |
| The AI answers about the wrong field ("modern ships" in a history course) | Check the skill's name says the subject, and file the topic under its unit on the skill map: both are sent with every request |
| "The AI provider rejected the API key. Check ANTHROPIC_API_KEY…" | The key in `server/.env` is wrong or missing. Restart the server after fixing it |
| Notes look like copied sentences | `AI_PROVIDER` is `mock` (practice mode). See [Switching on real AI](#switching-on-real-ai-optional) |
| Server won't start: "AI_PROVIDER must be one of…" | Misspelled provider name in `server/.env` |
| "We could not get captions for that video" | The video has captions turned off, or YouTube blocked the request. Try another video or paste a transcript as notes |
| "That PDF has no text we can read" | The PDF is scanned images. There's no OCR yet, so paste the text as notes instead |
| "That link points to a private network" | Working as intended: the server never fetches `localhost`, `192.168.x.x`, and so on |
| Upload fails with 413 | The file is over 25 MB (the Whisper limit). Trim the recording or split the file |
| A topic stays gray after a quiz | The quiz wasn't linked to that topic. Start quizzes from the map, or type the topic's exact name |
| "Find topics" adds nothing new | Every topic the AI found is already on the map; existing topics are never replaced |
| Events show at the wrong time | Times are stored in UTC and shown in the browser's time zone. Check the computer's time zone |
| "Plan my week" offers nothing | No free slots at the preferred times are left this week (past slots and busy times are skipped). Try next week |
| The timer shows the wrong time after a reload | It's worked out from `started_at`, so check the computer clock |
| Uploaded audio says "Practice-mode transcript" | `TRANSCRIPTION_PROVIDER` is `mock`. Set it to `gemini` (with `GEMINI_API_KEY`) or `openai` |
| "The AI is busy right now" | Every Gemini model in that task's list was overloaded (503) or out of quota (429). Free-tier limits reset daily; the server log shows Google's exact message |
| "Practice mode can only work from your resources…" | `AI_PROVIDER` is `mock` and the skill (or topic) has no resources. Add one, or switch on a real AI |
| The assistant only offers "Practice mode" | No AI key is set. Each provider appears once its key is in `server/.env` (restart after) |
| No microphone button in the assistant or a lesson | The browser has no speech recognition (Firefox). Use Chrome, Edge or Safari, or type |
| "Microphone access is blocked" | The browser was told not to share the microphone. Allow it in the site settings (the lock icon in the address bar) |
| Chat or notes show `$…$` symbols | The AI wrote LaTeX despite `PLAIN_MARKDOWN_RULE`. Ask again, or switch the assistant to the thorough model |
| "Topics can be at most 6 levels deep" | The topic (or the branch being moved) would go below level 6 (`MAX_TOPIC_DEPTH`). Move it higher, or add it under a broader topic |
| "A topic can't go inside itself…" | The new "Part of" is the topic or one of its own subtopics, which would make a loop |
| The map looks crowded | Lower "Levels shown", or open a topic and press "Centre the map here". The Outline view always fits |
| The topic details open in a popup on a laptop | They show beside the map only at 1024px wide or more (`WIDE_LAYOUT_QUERY`) |
| Pip answers questions the lesson never covered | The real model ignored `AI_STUDENT_RULES`. Its reason line usually shows why; the quiz model can be changed with `GEMINI_STANDARD_MODEL` |
| "That's the most one lesson takes" | 15 explanations (`MAX_TEACH_MESSAGES`). Start the quiz, then teach the topic again |
| A lesson's quiz isn't in the skill's quiz list | Working as intended: it lives with its lesson on the Teach and Quiz pages |
| A resource quiz only covers the first pages of a long book | It shouldn't: `order_for_even_coverage` samples the whole book. Check that the quiz's `scope` is `resource` |
| "Enter your current password to change your email or password" | Working as intended: the current password goes in the "Current password" field of that section |
| Logged out on another device after changing the password | Working as intended: a new password ends every other session |
| Progress says "Not enough yet to compare with an earlier period" | One of the two periods has nothing in it yet (no quizzes or work blocks then) |
| The focus chart's days look shifted | Days are grouped in the browser's time zone. Check the computer's time zone |
| Deployed site: CORS error | `CLIENT_ORIGIN` on Render must be the Vercel address exactly (`https://…`, no trailing path). Several are allowed, comma-separated |
| Deployed site: every request fails or 404s at `/api` | `VITE_API_URL` on Vercel must end in `/api`, and the site must be redeployed after changing it (Vite builds it in) |
| Deployed site: refreshing a dashboard page gives a 404 | `client/vercel.json` is missing, or Vercel's root directory isn't `client` |
| Deployed site: every account is gone | The Render free plan's disk is wiped on each deploy and restart. See [Deployment](#deployment) |
| The first request after a while takes ~30 seconds | Render's free plan sleeps after 15 minutes without traffic, then wakes on the next request |
| "Writing your lesson…" takes a while | A guided lesson is the biggest AI task (several steps, each with a question). About 20 seconds on Gemini Flash is normal |
| "There's nothing to explain again here" | The step's answer was right, or it has already been explained again twice (`MAX_LESSON_RETEACHES`). Move on |
| A learning path step is "Done" without a lesson | Quizzes show the topic is strong (80%+), which counts as done too |
| New topics sit at the end of the path | Topics added after the path was made are marked "new". Press "Reorder my path" |
| A reading section breaks in an odd place | Sections start at heading-like lines (short, no full stop) and are about 2,500 characters (`READING_SECTION_CHARACTERS`). PDFs with no headings are split by length |
| Selecting text doesn't fill "Stuck on something?" | Only text selected inside the section counts. Typing or pasting into the box works too |
| "No new key terms this time" | Every term the AI found is already in the list (names are compared ignoring letter case) |
| The assistant says it did something it didn't | Check the list under its reply: only actions marked done happened. Try "Gemini Flash (thorough)" for requests with many steps |
| The assistant's reply starts "The AI is busy right now" and lists what it did | The AI hit its rate limit part-way. What's listed was done; ask again for the rest in a minute |
| A delete didn't happen | Deleting waits for **Confirm** under the assistant's reply |
| A custom tool (app widget) can't load data from the web | Working as intended: apps are sandboxed with no network access. Ask for a card with a live block for your own data |
| The page didn't update after the assistant changed something | Pages reload on `notify_data_changed()`. A page that loads data without `use_api_data` won't; reload the page |
| A widget isn't showing on a page | Open it in the assistant's Widgets tab: it may be **Hidden**, or not on this page (⋯ → Customize… → Pages). Pinned widgets show above the page |
| Glass edges show dark bands or colour fringes | The displacement map must sit on the neutral grey layer in `GlassRefraction` (see [the edge bug](#finished-widgets-glass-the-app-kit-and-better-ai-widgets)) |
| "The AI service could not answer" with a Gemini 400 in the server log | Usually a model name in `.env` that your key can't use. List the available models with the Gemini SDK's `models.list` |

## Deployment

The API goes on **Render** and the website on **Vercel**. Both read their settings from files in this repository, so each takes a few clicks. Push the repository to GitHub first.

**1. The API on Render** ([render.yaml](render.yaml))
1. In Render: **New → Blueprint**, then pick the repository. It finds `render.yaml` and creates `studyapp-api` (folder `server`, Node 24, `npm ci`, `npm start`, health check `/api/health`).
2. It asks for the secret values once: `GEMINI_API_KEY`, `GEMINI_BACKUP_API_KEYS` (optional extra keys, comma-separated) and `CLIENT_ORIGIN`. Leave `CLIENT_ORIGIN` as a placeholder for now if the site isn't deployed yet.
3. When it's live, open `https://<your-api>.onrender.com/api/health`; it should show `{"status":"ok"}`.

**2. The website on Vercel** ([client/vercel.json](client/vercel.json))
1. In Vercel: **Add New → Project**, import the repository, and set **Root Directory** to `client`. Keep "Include files outside the root directory" on, because the images come from `/assets`.
2. Add the environment variable `VITE_API_URL` = `https://<your-api>.onrender.com/api`, then deploy. `vercel.json` builds with Vite and sends every path to `index.html`, so refreshing `/dashboard/progress` works.

**3. Connect them.** In Render, set `CLIENT_ORIGIN` to the Vercel address (for example `https://studyapp.vercel.app`). Add more, comma-separated, for preview or custom domains. Render redeploys by itself.

**Things to know**
- **Data on the free plan doesn't last.** Render's free disk is wiped on every deploy and restart, so the database and uploads start empty. That's fine for demos. To keep data, switch to a paid plan, add a disk mounted at `/var/data`, and set `DATABASE_PATH=/var/data/studyapp.db` and `UPLOADS_PATH=/var/data/uploads`.
- **Sleeping.** A free Render service sleeps after 15 minutes without traffic; the first request after that takes about 30 seconds.
- **Secrets** are set in the Render and Vercel dashboards only. `VITE_API_URL` is not secret: it ends up in the website's code.
- **Logins** use a token in the browser's storage sent in a header, not cookies, so the two sites being on different domains needs no extra setup.
- Pushing to GitHub redeploys both automatically.

### One server over plain HTTP

To host on your own machine or server instead, the API serves the website too, so there's one address and no CORS or `VITE_API_URL` to set:

```bash
npm run install:all
npm run build        # builds client/dist
npm start            # serves the site and the API on :4000 (PORT changes it)
```

Open `http://<server-address>:4000`. A build made without `VITE_API_URL` calls `/api` on whatever address it was opened from, so the same build works on `localhost`, a LAN IP or a domain. Run `npm run build` again after client changes. `npm start` reads `server/.env`. On Windows, allow Node through the firewall the first time so other devices can connect. Plain HTTP sends logins unencrypted, so for anything beyond a local network, put it behind HTTPS (for example a reverse proxy such as Caddy).

### Windows Server VM on port 80 (Azure)

[deploy/windows/install.ps1](deploy/windows/install.ps1) sets everything up as a Windows service that starts with Windows and restarts if it crashes ([WinSW](https://github.com/winsw/winsw), configured by [studyapp-service.xml](deploy/windows/studyapp-service.xml)).

1. On the VM, install **Node.js 24 LTS** from nodejs.org (keep the default folder) and copy the project there, without `node_modules`, `dist` or `server/data`.
2. In PowerShell **as Administrator**, from the project folder:
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
   ```
   It installs packages, builds the website, creates `server\.env` (port 80, data in `C:\StudyAppData`) if there isn't one, installs and starts the service, opens port 80 in Windows Firewall, and checks `/api/health`.
3. Once, in the Azure portal: **VM → Networking → Add inbound port rule**, TCP **80**, Allow.
4. Open `http://<vm-public-ip>`.

- **Updating:** copy in the new code (leave `server\.env` alone) and run the script again. It rebuilds and restarts the service.
- **Settings** such as AI keys go in `server\.env`; then restart with `Restart-Service studyapp`.
- **Data** lives in `C:\StudyAppData` (outside the project, so replacing the code never touches it). To back it up, stop the service and copy that folder.
- **Logs** are in `deploy\windows\logs`. Stop/start with `Stop-Service studyapp` / `Start-Service studyapp`.
- **Port 80 taken:** the script names the program using it. On Windows Server it's usually IIS: `Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled`.
- **Login limits:** after 10 tries for one email (or 100 logins and sign-ups from one address) in 15 minutes, the server answers "Too many attempts" until the 15 minutes are up. The numbers are in [server/config/constants.js](server/config/constants.js).
