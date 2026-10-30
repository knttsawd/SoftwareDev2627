import { Send } from 'lucide-react';
import { ASSISTANT_MESSAGE_MAX_LENGTH } from '../../config/constants.js';
import { get_button_classes } from '../button_styles.js';
import VoiceInputButton from '../VoiceInputButton.jsx';

// Adds spoken words to whatever is already typed, with a space between.
export function append_spoken_text(current_text, spoken_text) {
  return current_text.trim() ? `${current_text.trimEnd()} ${spoken_text}` : spoken_text;
}

// True for the Enter key on its own, which sends; Shift+Enter starts a new line instead.
// Enter while an input method is composing a character (e.g. Japanese) never sends.
export function is_send_key(key_event) {
  return key_event.key === 'Enter' && !key_event.shiftKey && !key_event.nativeEvent?.isComposing;
}

// Where the student types (or speaks) a message. set_draft is a state setter, so spoken
// words are added to the latest text. on_send() sends the draft. field_id, label,
// max_length and send_label let the assistant and the lesson page each set it up; the
// assistant can be open on the lesson page, so their ids must differ.
function ChatComposer({
  draft,
  set_draft,
  is_sending,
  on_send,
  field_id = 'chat-message',
  label = 'Your message',
  max_length = ASSISTANT_MESSAGE_MAX_LENGTH,
  send_label = 'Send',
}) {
  const can_send = draft.trim() !== '' && !is_sending;

  function handle_submit(submit_event) {
    submit_event.preventDefault();
    if (can_send) on_send();
  }

  function add_spoken_text(spoken_text) {
    set_draft((current_draft) => append_spoken_text(current_draft, spoken_text));
  }

  function handle_key_down(key_event) {
    if (!is_send_key(key_event)) return;
    key_event.preventDefault();
    if (can_send) on_send();
  }

  return (
    <form onSubmit={handle_submit} className="flex flex-col gap-2">
      <label htmlFor={field_id} className="text-small font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={field_id}
        rows={3}
        value={draft}
        maxLength={max_length}
        onChange={(change_event) => set_draft(change_event.target.value)}
        onKeyDown={handle_key_down}
        aria-describedby={`${field_id}-hint`}
        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
      />
      <p id={`${field_id}-hint`} className="text-caption text-ink-muted">
        Press Enter to send, or Shift+Enter for a new line.
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <button type="submit" disabled={!can_send} className={get_button_classes('primary')}>
          <Send aria-hidden="true" className="h-4 w-4" />
          {is_sending ? 'Sending…' : send_label}
        </button>
        <VoiceInputButton on_transcript={add_spoken_text} />
      </div>
    </form>
  );
}

export default ChatComposer;
