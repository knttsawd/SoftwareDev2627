import { Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { MAX_TOPIC_DEPTH } from '../../config/constants.js';
import { describe_mastery, MASTERY_LEVEL_DETAILS } from '../../config/mastery.js';
import { add_topic, generate_subtopics } from '../../services/topic_service.js';
import { list_child_topics, list_topic_path } from '../../utils/topic_tree.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import FormField from '../FormField.jsx';

// A topic's subtopics, one level down, and the two ways to add more detail: type a
// subtopic, or let the AI break the topic down. Choosing a subtopic opens it.
// on_topics_changed() reloads the map after a manual add; on_topic_map_changed(map)
// takes the map the AI returns.
function TopicSubtopics({ skill_id, topic, topics, Heading, on_select_topic, on_topics_changed, on_topic_map_changed }) {
  const [new_subtopic, set_new_subtopic] = useState('');
  const [field_errors, set_field_errors] = useState({});
  const [action_error, set_action_error] = useState('');
  const [is_generating, set_is_generating] = useState(false);
  const subtopics = list_child_topics(topics, topic.id);
  const is_deepest_level = list_topic_path(topics, topic.id).length >= MAX_TOPIC_DEPTH;

  async function handle_add(submit_event) {
    submit_event.preventDefault();
    set_field_errors({});
    set_action_error('');
    try {
      await add_topic(skill_id, { topic: new_subtopic, parent_topic_id: topic.id });
      set_new_subtopic('');
      on_topics_changed();
    } catch (add_error) {
      set_field_errors(add_error.field_errors ?? {});
      set_action_error(add_error.message);
    }
  }

  async function handle_generate() {
    set_is_generating(true);
    set_action_error('');
    try {
      on_topic_map_changed(await generate_subtopics(topic.id));
    } catch (generate_error) {
      set_action_error(generate_error.message);
    } finally {
      set_is_generating(false);
    }
  }

  return (
    <section aria-labelledby="topic-subtopics-heading" className="flex flex-col gap-3">
      <Heading id="topic-subtopics-heading" className="text-lead font-semibold text-ink">
        Subtopics
      </Heading>
      {subtopics.length === 0 ? (
        <p className="text-small text-ink-muted">None yet. Add detail by breaking this topic into smaller parts.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {subtopics.map((subtopic) => {
            const { icon: LevelIcon, node_classes } = MASTERY_LEVEL_DETAILS[subtopic.mastery_level];
            return (
              <li key={subtopic.id}>
                <button
                  type="button"
                  onClick={() => on_select_topic(subtopic.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-canvas"
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${node_classes}`}>
                    <LevelIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink">{subtopic.topic}</span>
                  <span className="text-caption text-ink-muted">{describe_mastery(subtopic)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {is_deepest_level ? (
        <p className="text-small text-ink-muted">This is the deepest level ({MAX_TOPIC_DEPTH}), so it can't have subtopics.</p>
      ) : (
        <>
          <form onSubmit={handle_add} noValidate className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <FormField
                field_id="new-subtopic"
                label="Add a subtopic"
                value={new_subtopic}
                on_change={set_new_subtopic}
                error={field_errors.topic}
              />
            </div>
            <button type="submit" className={get_button_classes('secondary')}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add
            </button>
          </form>
          <button type="button" onClick={handle_generate} disabled={is_generating} className={get_button_classes('ghost', 'self-start px-2')}>
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            {is_generating ? 'Finding subtopics…' : 'Break into subtopics with AI'}
          </button>
        </>
      )}
    </section>
  );
}

export default TopicSubtopics;
