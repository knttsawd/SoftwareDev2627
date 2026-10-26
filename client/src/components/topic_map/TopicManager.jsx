import { Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { add_topic, generate_topics } from '../../services/topic_service.js';
import { build_topic_tree, flatten_topic_tree, format_indented_name } from '../../utils/topic_tree.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import FormField from '../FormField.jsx';

// Ways to grow the map: let the AI find topics in the resources (or, with none yet,
// suggest the topics a course on the skill usually covers), or add a topic by hand at any
// level. Each topic's own details hold the rest (subtopics, renaming, moving, removing).
// The parent hears about each change: on_topic_map_changed(topic_map) with the new map
// after the AI adds topics, and on_topic_added(topic) after a manual add.
function TopicManager({ skill, topics, on_topic_map_changed, on_topic_added }) {
  const [new_topic, set_new_topic] = useState('');
  const [parent_topic_id, set_parent_topic_id] = useState('');
  const [field_errors, set_field_errors] = useState({});
  const [action_error, set_action_error] = useState('');
  const [is_generating, set_is_generating] = useState(false);
  const has_resources = skill.resource_count > 0;
  const generate_label = has_resources ? 'Find topics in my resources' : `Suggest topics for ${skill.name}`;

  async function handle_generate() {
    set_is_generating(true);
    set_action_error('');
    try {
      on_topic_map_changed(await generate_topics(skill.id));
    } catch (generate_error) {
      set_action_error(generate_error.message);
    } finally {
      set_is_generating(false);
    }
  }

  async function handle_add(submit_event) {
    submit_event.preventDefault();
    set_action_error('');
    set_field_errors({});
    try {
      on_topic_added(await add_topic(skill.id, { topic: new_topic, parent_topic_id: parent_topic_id || undefined }));
      set_new_topic('');
      set_parent_topic_id('');
    } catch (add_error) {
      set_field_errors(add_error.field_errors ?? {});
      set_action_error(add_error.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handle_generate} disabled={is_generating} className={get_button_classes('primary')}>
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          {is_generating ? 'Finding topics…' : generate_label}
        </button>
        {!has_resources && (
          <p className="text-small text-ink-muted">No resources yet, so the AI suggests what a course on this covers.</p>
        )}
      </div>
      {action_error && <AlertMessage>{action_error}</AlertMessage>}

      <details className="rounded-lg border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">Add a topic</summary>
        <form onSubmit={handle_add} noValidate className="flex flex-wrap items-end gap-3 border-t border-border p-4">
          <div className="min-w-56 flex-1">
            <FormField
              field_id="new-topic"
              label="New topic"
              value={new_topic}
              on_change={set_new_topic}
              error={field_errors.topic}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-topic-parent" className="text-small font-semibold text-ink">
              Part of
            </label>
            <select
              id="new-topic-parent"
              value={parent_topic_id}
              onChange={(change_event) => set_parent_topic_id(change_event.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
            >
              <option value="">Nothing (main topic)</option>
              {flatten_topic_tree(build_topic_tree(topics)).map((tree_node) => (
                <option key={tree_node.topic.id} value={tree_node.topic.id}>
                  {format_indented_name(tree_node)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={get_button_classes('secondary')}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add topic
          </button>
        </form>
      </details>
    </div>
  );
}

export default TopicManager;
