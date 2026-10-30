import { useEffect, useState } from 'react';
import { use_api_data } from '../../hooks/use_api_data.js';
import { fetch_topic_map } from '../../services/topic_service.js';
import { build_topic_tree, flatten_topic_tree, format_indented_name } from '../../utils/topic_tree.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import FormField from '../FormField.jsx';
import { build_lesson_details, CUSTOM_LESSON_TOPIC } from '../teach/TeachSetup.jsx';

// The numbers from limits.min to limits.max, for a "how many" dropdown.
export function list_count_options(limits) {
  return Array.from({ length: limits.max - limits.min + 1 }, (unused_value, offset) => limits.min + offset);
}

// Picks a topic of the skill (at any level, or typed in) and how much to make, then calls
// on_submit(details), where details is { topic_id } or { topic }, plus count_field. Used to
// start a guided lesson and to make practice problems. The first topic is chosen once the
// skill's topics load, unless initial_topic_id names one.
function LearnTopicForm({ skill, form_id, heading, initial_topic_id, count_field, count_label, count_limits, submit_label, busy_label, on_submit }) {
  const topic_map_state = use_api_data(() => fetch_topic_map(skill.id), [skill.id]);
  const [topic_choice, set_topic_choice] = useState(initial_topic_id ?? '');
  const [custom_topic, set_custom_topic] = useState('');
  const [count, set_count] = useState(count_limits.default);
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_busy, set_is_busy] = useState(false);

  const topic_nodes = flatten_topic_tree(build_topic_tree(topic_map_state.data?.topics ?? []));
  const has_loaded_topics = Boolean(topic_map_state.data);
  useEffect(() => {
    if (!has_loaded_topics) return;
    const has_choice = topic_nodes.some((tree_node) => tree_node.topic.id === topic_choice);
    if (topic_choice !== CUSTOM_LESSON_TOPIC && !has_choice) set_topic_choice(topic_nodes[0]?.topic.id ?? CUSTOM_LESSON_TOPIC);
  }, [has_loaded_topics, topic_nodes, topic_choice]);

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_is_busy(true);
    set_form_error('');
    set_field_errors({});
    try {
      await on_submit({ ...build_lesson_details(topic_choice, custom_topic), [count_field]: count });
    } catch (submit_error) {
      set_field_errors(submit_error.field_errors ?? {});
      set_form_error(submit_error.message);
    } finally {
      set_is_busy(false);
    }
  }

  return (
    <form onSubmit={handle_submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-heading-3 font-semibold text-ink">{heading}</h2>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${form_id}-topic`} className="text-small font-semibold text-ink">
            Topic
          </label>
          <select
            id={`${form_id}-topic`}
            value={topic_choice}
            onChange={(change_event) => set_topic_choice(change_event.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
          >
            {topic_nodes.map((tree_node) => (
              <option key={tree_node.topic.id} value={tree_node.topic.id}>
                {format_indented_name(tree_node)}
              </option>
            ))}
            <option value={CUSTOM_LESSON_TOPIC}>Type my own topic…</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${form_id}-count`} className="text-small font-semibold text-ink">
            {count_label}
          </label>
          <select
            id={`${form_id}-count`}
            value={count}
            onChange={(change_event) => set_count(Number(change_event.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
          >
            {list_count_options(count_limits).map((count_option) => (
              <option key={count_option} value={count_option}>
                {count_option}
              </option>
            ))}
          </select>
        </div>
      </div>
      {topic_choice === CUSTOM_LESSON_TOPIC && (
        <FormField
          field_id={`${form_id}-custom-topic`}
          label="Your topic"
          placeholder="e.g. The water cycle"
          value={custom_topic}
          on_change={set_custom_topic}
          error={field_errors.topic}
        />
      )}
      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      <button type="submit" disabled={is_busy || !topic_choice} className={get_button_classes('primary', 'self-start')}>
        {is_busy ? busy_label : submit_label}
      </button>
    </form>
  );
}

export default LearnTopicForm;
