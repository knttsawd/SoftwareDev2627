import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { format_date } from '../../utils/format.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';

// A skill's saved lessons or practice sets, newest first, each with a button to open it
// and one to delete it. items_state is use_api_data's result for the list; describe(item)
// says how far it got, get_open_label(item) is "Continue" or "Review", noun names one item
// ("lesson") for confirmations and screen readers, and delete_item(id) removes one.
function SavedActivityList({ items_state, noun, empty_text, describe, get_open_label, on_open, delete_item }) {
  const [action_error, set_action_error] = useState('');
  const items = items_state.data ?? [];

  const confirm = use_confirm();

  async function handle_delete(item) {
    const message = `Your ${noun} on "${item.topic}" is deleted.`;
    if (!(await confirm({ title: `Delete this ${noun}?`, message, confirm_label: 'Delete' }))) return;
    set_action_error('');
    try {
      await delete_item(item.id);
      items_state.set_data((current_items) => current_items.filter((current_item) => current_item.id !== item.id));
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  if (items_state.is_loading && !items_state.data) return <p className="text-small text-ink-muted">Loading…</p>;
  if (items_state.error) return <AlertMessage>{items_state.error}</AlertMessage>;
  if (items.length === 0) return <p className="text-small text-ink-muted">{empty_text}</p>;

  return (
    <div className="flex flex-col gap-2">
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const open_label = get_open_label(item);
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold text-ink">{item.topic}</span>
                <span className="text-caption text-ink-muted">
                  {describe(item)} · {format_date(item.created_at)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => on_open(item.id)}
                aria-label={`${open_label} the ${noun} on ${item.topic}`}
                className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}
              >
                {open_label}
              </button>
              <button type="button" onClick={() => handle_delete(item)} className={get_button_classes('ghost', 'px-2')}>
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">
                  Delete the {noun} on {item.topic}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SavedActivityList;
