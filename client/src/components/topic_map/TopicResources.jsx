import { BookOpen, FolderInput, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { RESOURCE_TYPE_DETAILS } from '../../config/resource_types.js';
import { move_resource_to_topic } from '../../services/resource_service.js';
import { build_learn_path, build_quiz_path } from '../../utils/study_paths.js';
import { list_branch_topic_ids, list_topic_resources } from '../../utils/topic_tree.js';
import { AddResourceForm } from '../AddResourceDialog.jsx';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';

// One resource in the topic, with links to read it with a guide and to quiz on it, and, if
// it's filed under this topic itself (not a subtopic), a button to take it out.
function TopicResourceItem({ skill_id, resource, on_remove }) {
  const { label, icon: TypeIcon } = RESOURCE_TYPE_DETAILS[resource.resource_type];
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <TypeIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-700" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-small font-semibold text-ink">{resource.title}</span>
        <span className="text-caption text-ink-muted">
          {label}
          {resource.in_subtopic && ` · in ${resource.in_subtopic}`}
        </span>
      </span>
      <Link
        to={build_learn_path({ skill_id, tab: 'reading', resource_id: resource.id })}
        aria-label={`Read ${resource.title} with a guide`}
        className={get_button_classes('secondary', 'px-2.5 py-1 text-caption')}
      >
        <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
        Read
      </Link>
      <Link
        to={build_quiz_path({ skill_id, resource_id: resource.id })}
        aria-label={`Quiz me on ${resource.title}`}
        className={get_button_classes('secondary', 'px-2.5 py-1 text-caption')}
      >
        Quiz me
      </Link>
      {!resource.in_subtopic && (
        <button
          type="button"
          onClick={() => on_remove(resource)}
          aria-label={`Take out ${resource.title}`}
          className={get_button_classes('ghost', 'px-2 py-1 text-caption')}
        >
          <X aria-hidden="true" className="h-4 w-4" />
          Take out
        </button>
      )}
    </li>
  );
}

// A topic's resources (including those filed under its subtopics) and the ways to add
// more: move in one the skill already has, or add a new one straight into the topic.
// Heading is the heading element for the two parts ('h3' or 'h4', to fit where it sits).
function TopicResources({ skill, topic, topics, resources, Heading, on_resource_added, on_resource_updated }) {
  const [move_resource_id, set_move_resource_id] = useState('');
  const [is_adding, set_is_adding] = useState(false);
  const [status_message, set_status_message] = useState('');
  const [action_error, set_action_error] = useState('');

  const topic_resources = list_topic_resources(topics, resources, topic.id);
  const branch_ids = list_branch_topic_ids(topics, topic.id);
  const other_resources = resources.filter((resource) => !branch_ids.has(resource.topic_id));

  async function file_resource(resource_id, topic_id, success_message) {
    set_action_error('');
    try {
      on_resource_updated(await move_resource_to_topic(resource_id, topic_id));
      set_status_message(success_message);
    } catch (move_error) {
      set_action_error(move_error.message);
    }
  }

  function handle_move(submit_event) {
    submit_event.preventDefault();
    const resource = other_resources.find((candidate) => candidate.id === move_resource_id);
    if (!resource) return;
    set_move_resource_id('');
    file_resource(resource.id, topic.id, `Moved "${resource.title}" into ${topic.topic}.`);
  }

  function handle_added(resource) {
    on_resource_added(resource);
    set_is_adding(false);
    set_status_message(`Added "${resource.title}" to ${topic.topic}.`);
  }

  return (
    <>
      {status_message && <AlertMessage tone="success">{status_message}</AlertMessage>}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}

      <section aria-labelledby="topic-resources-heading" className="flex flex-col gap-3">
        <Heading id="topic-resources-heading" className="text-lead font-semibold text-ink">
          Resources in this topic
        </Heading>
        {topic_resources.length === 0 ? (
          <p className="text-small text-ink-muted">
            None yet. Quizzes on this topic use the best matches from the rest of {skill.name}, plus the AI's general
            knowledge.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topic_resources.map((resource) => (
              <TopicResourceItem
                key={resource.id}
                skill_id={skill.id}
                resource={resource}
                on_remove={() => file_resource(resource.id, null, `Took "${resource.title}" out of ${topic.topic}.`)}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="topic-add-heading" className="flex flex-col gap-3">
        <Heading id="topic-add-heading" className="text-lead font-semibold text-ink">
          Add to this topic
        </Heading>
        {other_resources.length > 0 && (
          <form onSubmit={handle_move} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="topic-move-resource" className="text-small font-semibold text-ink">
                A resource you already added
              </label>
              <select
                id="topic-move-resource"
                value={move_resource_id}
                onChange={(change_event) => set_move_resource_id(change_event.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
              >
                <option value="">Choose a resource…</option>
                {other_resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.title}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={!move_resource_id} className={get_button_classes('secondary')}>
              <FolderInput aria-hidden="true" className="h-4 w-4" />
              Move here
            </button>
          </form>
        )}
        {is_adding ? (
          <div className="rounded-xl border border-border p-4">
            <AddResourceForm skill={skill} fixed_topic={topic} on_added={handle_added} />
          </div>
        ) : (
          <button type="button" onClick={() => set_is_adding(true)} className={get_button_classes('secondary', 'self-start')}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add a new resource
          </button>
        )}
      </section>
    </>
  );
}

export default TopicResources;
