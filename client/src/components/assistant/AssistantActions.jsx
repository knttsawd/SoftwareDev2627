import { Ban, CircleCheck, CircleX, Clock } from 'lucide-react';
import { Link } from 'react-router';
import { use_assistant } from '../../context/AssistantContext.jsx';
import { find_stack_item, to_widget_item } from '../../utils/widget_layout.js';
import { get_button_classes } from '../button_styles.js';
import WidgetWindow from '../widgets/WidgetWindow.jsx';

// How each action status looks: a different icon shape and a word for screen readers, so
// it never depends on color.
export const ACTION_STATUS_DETAILS = {
  done: { icon: CircleCheck, word: 'Done', icon_classes: 'text-success' },
  failed: { icon: CircleX, word: "Couldn't do it", icon_classes: 'text-danger' },
  pending: { icon: Clock, word: 'Waiting for you', icon_classes: 'text-warning' },
  cancelled: { icon: Ban, word: 'Cancelled', icon_classes: 'text-ink-muted' },
};

// One action: its status, what it was, the outcome, a link to open what it made, Confirm
// and Cancel while it waits, and the widget it made (if it still exists).
function AssistantAction({ message_id, action, busy_action_id, on_confirm, on_cancel }) {
  const { widgets_state, stacks_state } = use_assistant();
  const { icon: StatusIcon, word, icon_classes } = ACTION_STATUS_DETAILS[action.status];
  const widget = action.widget_id ? (widgets_state.data ?? []).find((item) => item.id === action.widget_id) : null;
  const is_busy = busy_action_id === action.id;

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-start gap-2 text-small">
        <StatusIcon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${icon_classes}`} />
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold text-ink">
            <span className="sr-only">{word}: </span>
            {action.label}
          </span>
          {action.summary && action.status !== 'done' && <span className="text-ink-muted">{action.summary}</span>}
          {action.link && action.status === 'done' && (
            <Link to={action.link} className="self-start font-semibold text-brand-700 underline">
              Open
            </Link>
          )}
        </div>
      </div>
      {action.status === 'pending' && (
        <div className="flex flex-wrap gap-2 pl-6">
          <button type="button" onClick={() => on_confirm(message_id, action.id)} disabled={is_busy} className={get_button_classes('danger', 'px-3 py-1.5 text-small')}>
            {is_busy ? 'Working…' : 'Confirm'}
          </button>
          <button type="button" onClick={() => on_cancel(message_id, action.id)} disabled={is_busy} className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}>
            Cancel
          </button>
        </div>
      )}
      {widget && (
        <WidgetWindow
          item={to_widget_item(widget)}
          placement="panel"
          id_prefix={`chat-${message_id}`}
          stack_item={find_stack_item(stacks_state.data ?? [], widgets_state.data ?? [], widget.id)}
        />
      )}
    </li>
  );
}

// What the assistant did in one reply. on_confirm(message_id, action_id) and
// on_cancel(...) answer actions that wait for the student; busy_action_id is the one
// being run.
function AssistantActions({ message, busy_action_id, on_confirm, on_cancel }) {
  if (message.actions.length === 0) return null;
  return (
    <ul aria-label="What the assistant did" className="flex flex-col gap-2 rounded-xl border border-border bg-canvas p-3">
      {message.actions.map((action) => (
        <AssistantAction
          key={action.id}
          message_id={message.id}
          action={action}
          busy_action_id={busy_action_id}
          on_confirm={on_confirm}
          on_cancel={on_cancel}
        />
      ))}
    </ul>
  );
}

export default AssistantActions;
