import { Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { delete_topic, update_topic } from '../../services/topic_service.js';
import { build_topic_tree, flatten_topic_tree, format_indented_name, list_possible_parents } from '../../utils/topic_tree.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import FormField from '../FormField.jsx';

// The topic_updates to send: only the fields that changed. parent_topic_id '' means
// "main topic", sent as null.
export function build_topic_updates(topic, form_values) {
  const topic_updates = {};
  if (form_values.topic.trim() !== topic.topic) topic_updates.topic = form_values.topic;
  const parent_topic_id = form_values.parent_topic_id || null;
  if (parent_topic_id !== topic.parent_node_id) topic_updates.parent_topic_id = parent_topic_id;
  return topic_updates;
}

// Rename a topic, move it (with everything under it) under another topic, or remove it.
// Removing works like deleting a folder but keeping what's in it: its subtopics and
// resources move up a level. on_topics_changed() reloads the map afterwards;
// on_topic_deleted(topic) runs after a removal.
function TopicEditor({ topic, topics, on_topics_changed, on_topic_deleted }) {
  const [form_values, set_form_values] = useState({ topic: topic.topic, parent_topic_id: topic.parent_node_id ?? '' });
  const [field_errors, set_field_errors] = useState({});
  const [action_error, set_action_error] = useState('');
  const possible_parent_ids = new Set(list_possible_parents(topics, topic.id).map((candidate) => candidate.id));
  const parent_options = flatten_topic_tree(build_topic_tree(topics)).filter((tree_node) =>
    possible_parent_ids.has(tree_node.topic.id),
  );

  async function handle_save(submit_event) {
    submit_event.preventDefault();
    const topic_updates = build_topic_updates(topic, form_values);
    if (Object.keys(topic_updates).length === 0) return;
    set_field_errors({});
    set_action_error('');
    try {
      await update_topic(topic.id, topic_updates);
      on_topics_changed();
    } catch (save_error) {
      set_field_errors(save_error.field_errors ?? {});
      set_action_error(save_error.message);
    }
  }

  const confirm = use_confirm();

  async function handle_remove() {
    const message = 'Its subtopics and resources move up a level, and its quizzes and notes are kept.';
    if (!(await confirm({ title: `Remove "${topic.topic}"?`, message, confirm_label: 'Remove' }))) return;
    set_action_error('');
    try {
      await delete_topic(topic.id);
      on_topic_deleted(topic);
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-4 py-3 text-small font-semibold text-ink">Rename, move or remove</summary>
      <form onSubmit={handle_save} noValidate className="flex flex-col gap-3 border-t border-border p-4">
        <FormField
          field_id="edit-topic-name"
          label="Name"
          value={form_values.topic}
          on_change={(new_value) => set_form_values((current_values) => ({ ...current_values, topic: new_value }))}
          error={field_errors.topic}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-topic-parent" className="text-small font-semibold text-ink">
            Part of
          </label>
          <select
            id="edit-topic-parent"
            value={form_values.parent_topic_id}
            onChange={(change_event) =>
              set_form_values((current_values) => ({ ...current_values, parent_topic_id: change_event.target.value }))
            }
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
          >
            <option value="">Nothing (main topic)</option>
            {parent_options.map((tree_node) => (
              <option key={tree_node.topic.id} value={tree_node.topic.id}>
                {format_indented_name(tree_node)}
              </option>
            ))}
          </select>
        </div>
        {action_error && <AlertMessage>{action_error}</AlertMessage>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={get_button_classes('secondary')}>
            <Save aria-hidden="true" className="h-4 w-4" />
            Save changes
          </button>
          <button type="button" onClick={handle_remove} className={get_button_classes('ghost', 'text-danger')}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Remove topic
          </button>
        </div>
      </form>
    </details>
  );
}

export default TopicEditor;
