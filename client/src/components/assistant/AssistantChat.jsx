import { Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ASSISTANT_LONG_WAIT_MS } from '../../config/constants.js';
import { use_assistant } from '../../context/AssistantContext.jsx';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { use_api_data } from '../../hooks/use_api_data.js';
import {
  cancel_assistant_action,
  choose_assistant,
  clear_assistant,
  confirm_assistant_action,
  fetch_assistant,
  send_assistant_message,
} from '../../services/assistant_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import ChatComposer from '../chat/ChatComposer.jsx';
import MarkdownContent from '../MarkdownContent.jsx';
import AssistantActions from './AssistantActions.jsx';

export const COMPOSER_ID = 'assistant-message';

// Ready-made first requests, showing the kinds of things the assistant can do.
export const STARTER_REQUESTS = [
  'What can you do?',
  'Quiz me on my weakest topic',
  'Plan three study sessions for this week',
  'Make me a countdown to my next exam',
];

// The conversation with an added exchange, or with one message swapped for its update.
export function add_exchange(assistant, { user_message, assistant_message }) {
  return { ...assistant, messages: [...assistant.messages, user_message, assistant_message] };
}

export function replace_message(assistant, updated_message) {
  return { ...assistant, messages: assistant.messages.map((message) => (message.id === updated_message.id ? updated_message : message)) };
}

// One message: the student's as typed, the assistant's in Markdown with what it did.
function AssistantMessage({ message, busy_action_id, on_confirm, on_cancel }) {
  const is_student = message.role === 'user';
  return (
    <li className={`flex flex-col gap-1 ${is_student ? 'items-end' : 'items-stretch'}`}>
      <span className="text-caption font-semibold text-ink-muted">{is_student ? 'You' : 'Assistant'}</span>
      {is_student ? (
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-brand-600 px-4 py-3 text-body text-white">{message.content}</p>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
          <MarkdownContent markdown_text={message.content} />
          <AssistantActions message={message} busy_action_id={busy_action_id} on_confirm={on_confirm} on_cancel={on_cancel} />
        </div>
      )}
    </li>
  );
}

// What the assistant is doing while a reply is on its way. After ASSISTANT_LONG_WAIT_MS it
// says that bigger jobs take longer, so a slow reply doesn't look stuck.
function PendingStatus() {
  const [is_long_wait, set_is_long_wait] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => set_is_long_wait(true), ASSISTANT_LONG_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <p role="status" className="text-small text-ink-muted">
      {is_long_wait ? 'Still working. Bigger jobs, like building an app, can take a minute or two.' : 'Working on it…'}
    </p>
  );
}

// The chat tab: which AI, the conversation, and the message box. Replies can open pages
// (client_actions) and change the student's data, which makes everything on screen reload.
function AssistantChat({ is_visible }) {
  const { draft_request } = use_assistant();
  const location = useLocation();
  const navigate = useNavigate();
  const assistant_state = use_api_data(fetch_assistant, []);
  const [draft, set_draft] = useState('');
  const [pending_message, set_pending_message] = useState(null);
  const [busy_action_id, set_busy_action_id] = useState(null);
  const [action_error, set_action_error] = useState('');
  const thread_ref = useRef(null);
  const assistant = assistant_state.data;

  // A question handed over by another part of the page ("Ask the assistant") goes in the box.
  useEffect(() => {
    if (draft_request) set_draft(draft_request.draft);
  }, [draft_request]);

  // The message box takes focus when the chat shows (once the conversation has loaded).
  const has_loaded = Boolean(assistant);
  useEffect(() => {
    if (is_visible && has_loaded) document.getElementById(COMPOSER_ID)?.focus();
  }, [is_visible, has_loaded, draft_request]);

  useEffect(() => {
    const thread_element = thread_ref.current;
    if (thread_element) thread_element.scrollTop = thread_element.scrollHeight;
  }, [assistant?.messages.length, pending_message]);

  // Opens pages the assistant asked for. Data it changed refreshes by itself: every saving
  // request tells the page to reload (see send_authed_request).
  function apply_effects({ client_actions }) {
    for (const client_action of client_actions) {
      if (client_action.type === 'navigate') navigate(client_action.path);
    }
  }

  async function send(message_text) {
    const message = message_text.trim();
    if (!message || pending_message) return;
    set_pending_message(message);
    set_draft('');
    set_action_error('');
    try {
      const turn = await send_assistant_message(message, `${location.pathname}${location.search}`);
      assistant_state.set_data((current_assistant) => add_exchange(current_assistant, turn));
      apply_effects(turn);
    } catch (send_error) {
      set_draft(message);
      set_action_error(send_error.message);
    } finally {
      set_pending_message(null);
    }
  }

  async function answer_action(answer, message_id, action_id) {
    set_busy_action_id(action_id);
    set_action_error('');
    try {
      const outcome = await answer(message_id, action_id);
      assistant_state.set_data((current_assistant) => replace_message(current_assistant, outcome.message));
      if (outcome.client_actions) apply_effects(outcome);
    } catch (answer_error) {
      set_action_error(answer_error.message);
    } finally {
      set_busy_action_id(null);
    }
  }

  async function change_assistant(assistant_id) {
    const previous_id = assistant.assistant_id;
    assistant_state.set_data((current_assistant) => ({ ...current_assistant, assistant_id }));
    set_action_error('');
    try {
      await choose_assistant(assistant_id);
    } catch (choose_error) {
      assistant_state.set_data((current_assistant) => ({ ...current_assistant, assistant_id: previous_id }));
      set_action_error(choose_error.message);
    }
  }

  const confirm = use_confirm();

  async function handle_clear() {
    const message = 'Your messages with the assistant are deleted. Anything it made for you stays.';
    if (!(await confirm({ title: 'Clear the conversation?', message, confirm_label: 'Clear' }))) return;
    set_action_error('');
    try {
      await clear_assistant();
      assistant_state.set_data((current_assistant) => ({ ...current_assistant, messages: [] }));
    } catch (clear_error) {
      set_action_error(clear_error.message);
    }
  }

  if (assistant_state.error && !assistant) return <AlertMessage>{assistant_state.error}</AlertMessage>;
  if (!assistant) return <p className="text-small text-ink-muted">Loading…</p>;

  const chosen_assistant = assistant.assistants.find((option) => option.id === assistant.assistant_id);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="assistant-ai" className="text-caption font-semibold text-ink">
            AI
          </label>
          <select
            id="assistant-ai"
            value={assistant.assistant_id}
            onChange={(change_event) => change_assistant(change_event.target.value)}
            aria-describedby="assistant-ai-description"
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-small text-ink"
          >
            {assistant.assistants.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {assistant.messages.length > 0 && (
          <button type="button" onClick={handle_clear} className={get_button_classes('ghost', 'px-2 py-1 text-small')}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>
      <p id="assistant-ai-description" className="text-caption text-ink-muted">
        {chosen_assistant?.description}
      </p>

      <div ref={thread_ref} role="log" aria-label="Conversation with the assistant" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-canvas p-3">
        {assistant.messages.length === 0 && !pending_message ? (
          <div className="flex flex-col gap-3">
            <p className="text-body text-ink">
              Ask anything about what you're studying, or ask me to do things for you: make skills, topics, quizzes,
              lessons and schedule events, open pages, or build widgets and tools.
            </p>
            <ul aria-label="Things to try" className="flex flex-wrap gap-2">
              {STARTER_REQUESTS.map((starter_request) => (
                <li key={starter_request}>
                  <button
                    type="button"
                    onClick={() => send(starter_request)}
                    className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-small text-ink hover:bg-brand-50"
                  >
                    <Sparkles aria-hidden="true" className="h-4 w-4 text-brand-700" />
                    {starter_request}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {assistant.messages.map((message) => (
              <AssistantMessage
                key={message.id}
                message={message}
                busy_action_id={busy_action_id}
                on_confirm={(message_id, action_id) => answer_action(confirm_assistant_action, message_id, action_id)}
                on_cancel={(message_id, action_id) => answer_action(cancel_assistant_action, message_id, action_id)}
              />
            ))}
            {pending_message && (
              <>
                <AssistantMessage message={{ id: 'pending', role: 'user', content: pending_message, actions: [] }} />
                <li>
                  <PendingStatus />
                </li>
              </>
            )}
          </ol>
        )}
      </div>
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      <ChatComposer
        field_id={COMPOSER_ID}
        draft={draft}
        set_draft={set_draft}
        is_sending={Boolean(pending_message)}
        on_send={() => send(draft)}
        label="Ask or tell the assistant"
      />
    </div>
  );
}

export default AssistantChat;
