import { BookOpen, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { RESOURCE_TYPE_DETAILS } from '../config/resource_types.js';
import { use_confirm } from '../context/ConfirmContext.jsx';
import { delete_resource } from '../services/resource_service.js';
import { format_character_count, format_date } from '../utils/format.js';
import { build_learn_path, build_quiz_path } from '../utils/study_paths.js';
import { find_topic_name } from '../utils/topic_tree.js';
import AddResourceDialog from './AddResourceDialog.jsx';
import AlertMessage from './AlertMessage.jsx';
import { get_button_classes } from './button_styles.js';

// "Added "Week 1". Only the first part was kept because it was very long."
export function describe_added_resource(resource) {
  const truncation_note = resource.is_truncated ? ' Only the first part was kept because it was very long.' : '';
  return `Added "${resource.title}".${truncation_note}`;
}

// One resource row: type icon and label, title, size, date, topic, links to read it with a
// guide and to quiz on it, and a delete button.
function ResourceItem({ skill_id, resource, topic_name, on_delete }) {
  const { label, icon: TypeIcon } = RESOURCE_TYPE_DETAILS[resource.resource_type];
  const details = [label, format_character_count(resource.character_count), format_date(resource.created_at)];
  if (topic_name) details.push(`Topic: ${topic_name}`);

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <TypeIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-700" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-ink">{resource.title}</span>
        <span className="text-caption text-ink-muted">{details.join(' · ')}</span>
      </div>
      <Link
        to={build_learn_path({ skill_id, tab: 'reading', resource_id: resource.id })}
        aria-label={`Read ${resource.title} with a guide`}
        className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}
      >
        <BookOpen aria-hidden="true" className="h-4 w-4" />
        Read
      </Link>
      <Link
        to={build_quiz_path({ skill_id, resource_id: resource.id })}
        aria-label={`Quiz me on ${resource.title}`}
        className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}
      >
        <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
        Quiz me
      </Link>
      <button type="button" onClick={() => on_delete(resource)} className={get_button_classes('ghost', 'px-2')}>
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        <span className="sr-only">Delete {resource.title}</span>
      </button>
    </li>
  );
}

// The skill's resources, with the "Add resource" popup. The parent owns the list
// (resources_state from use_api_data) because the topic map shows it too:
// on_resource_added(resource) and on_resource_deleted(resource_id) report each change.
function ResourcesPanel({ skill, resources_state, topics, on_resource_added, on_resource_deleted }) {
  const [is_dialog_open, set_is_dialog_open] = useState(false);
  const [status_message, set_status_message] = useState('');
  const [action_error, set_action_error] = useState('');

  function handle_added(resource) {
    on_resource_added(resource);
    set_is_dialog_open(false);
    set_status_message(describe_added_resource(resource));
  }

  const confirm = use_confirm();

  async function handle_delete(resource) {
    const message = 'Notes and quizzes already made from it are kept.';
    if (!(await confirm({ title: `Delete "${resource.title}"?`, message, confirm_label: 'Delete' }))) return;
    set_action_error('');
    try {
      await delete_resource(resource.id);
      on_resource_deleted(resource.id);
      set_status_message(`Deleted "${resource.title}".`);
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  return (
    <section aria-labelledby="resources-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="resources-heading" className="text-heading-2 font-bold text-ink">
          Resources
        </h2>
        <button type="button" onClick={() => set_is_dialog_open(true)} className={get_button_classes('primary')}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add resource
        </button>
      </div>

      {status_message && <AlertMessage tone="success">{status_message}</AlertMessage>}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {resources_state.error && <AlertMessage>{resources_state.error}</AlertMessage>}
      {resources_state.is_loading && <p className="text-small text-ink-muted">Loading resources…</p>}
      {resources_state.data?.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-body text-ink-muted">
          No resources yet. Add notes, PDFs, recordings or links you're studying from. Until then, the AI uses its
          general knowledge of {skill.name}.
        </p>
      )}
      {resources_state.data?.length > 0 && (
        <ul className="flex flex-col gap-2">
          {resources_state.data.map((resource) => (
            <ResourceItem
              key={resource.id}
              skill_id={skill.id}
              resource={resource}
              topic_name={find_topic_name(topics, resource.topic_id)}
              on_delete={handle_delete}
            />
          ))}
        </ul>
      )}

      <AddResourceDialog
        skill={skill}
        topics={topics}
        is_open={is_dialog_open}
        on_close={() => set_is_dialog_open(false)}
        on_added={handle_added}
      />
    </section>
  );
}

export default ResourcesPanel;
