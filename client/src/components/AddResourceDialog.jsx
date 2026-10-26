import { Link as LinkIcon, NotebookPen, Upload } from 'lucide-react';
import { useState } from 'react';
import { ACCEPTED_FILE_EXTENSIONS, UPLOAD_MAX_BYTES, UPLOAD_MAX_LABEL } from '../config/resource_types.js';
import { add_resource_link, add_resource_text, upload_resource_file } from '../services/resource_service.js';
import AlertMessage from './AlertMessage.jsx';
import { get_button_classes } from './button_styles.js';
import Dialog from './Dialog.jsx';
import FormField from './FormField.jsx';

const RESOURCE_MODES = [
  { value: 'file', label: 'Upload a file', icon: Upload },
  { value: 'link', label: 'Add a link', icon: LinkIcon },
  { value: 'text', label: 'Type or paste notes', icon: NotebookPen },
];

// The radio buttons are visually hidden; each label shows the choice and, through
// has-[:focus-visible], the keyboard focus ring.
const MODE_CHOSEN_CLASSES = 'border-brand-600 bg-brand-50 font-semibold text-brand-800';
const MODE_IDLE_CLASSES = 'border-border bg-surface text-ink hover:bg-canvas';

// Returns an error message if the chosen file can't be uploaded, otherwise null.
export function check_selected_file(file) {
  if (!file) return 'Choose a file to upload';
  if (file.size > UPLOAD_MAX_BYTES) return `That file is larger than ${UPLOAD_MAX_LABEL}`;
  return null;
}

// Sends the form to the right endpoint for the chosen mode and returns the new resource.
// A blank topic_id means the resource isn't filed under a topic.
export function submit_resource(skill_id, mode, form_values) {
  const topic_id = form_values.topic_id || undefined;
  if (mode === 'file') return upload_resource_file(skill_id, form_values.file, form_values.title, topic_id);
  if (mode === 'link') return add_resource_link(skill_id, { url: form_values.url, title: form_values.title, topic_id });
  return add_resource_text(skill_id, { title: form_values.title, text: form_values.text, topic_id });
}

// The add-a-resource form. It resets each time it is shown. With fixed_topic the resource
// goes under that topic; otherwise, if the skill has topics, the student can pick one.
// Used inside AddResourceDialog and the topic popup on the skill map.
export function AddResourceForm({ skill, topics = [], fixed_topic = null, on_added }) {
  const [mode, set_mode] = useState('file');
  const [form_values, set_form_values] = useState({ file: null, url: '', title: '', text: '', topic_id: fixed_topic?.id ?? '' });
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_saving, set_is_saving] = useState(false);

  function update_value(field_name, new_value) {
    set_form_values((current_values) => ({ ...current_values, [field_name]: new_value }));
  }

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_form_error('');
    set_field_errors({});
    const file_error = mode === 'file' ? check_selected_file(form_values.file) : null;
    if (file_error) {
      set_field_errors({ file: file_error });
      return;
    }

    set_is_saving(true);
    try {
      on_added(await submit_resource(skill.id, mode, form_values));
    } catch (save_error) {
      set_field_errors(save_error.field_errors ?? {});
      set_form_error(save_error.message);
      set_is_saving(false);
    }
  }

  return (
    <form onSubmit={handle_submit} noValidate className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-semibold text-ink">What are you adding?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {RESOURCE_MODES.map((resource_mode) => (
            <label
              key={resource_mode.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-small has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-600 ${mode === resource_mode.value ? MODE_CHOSEN_CLASSES : MODE_IDLE_CLASSES}`}
            >
              <input
                type="radio"
                name="resource-mode"
                value={resource_mode.value}
                checked={mode === resource_mode.value}
                onChange={() => set_mode(resource_mode.value)}
                className="sr-only"
              />
              <resource_mode.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {resource_mode.label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'file' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="resource-file" className="text-small font-semibold text-ink">
            File
          </label>
          <input
            id="resource-file"
            type="file"
            accept={ACCEPTED_FILE_EXTENSIONS.join(',')}
            onChange={(change_event) => update_value('file', change_event.target.files[0] ?? null)}
            aria-describedby="resource-file-hint"
            aria-invalid={field_errors.file ? true : undefined}
            className="text-small text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-800"
          />
          <p id="resource-file-hint" className="text-caption text-ink-muted">
            PDF, text or Markdown notes, or audio and video recordings, up to {UPLOAD_MAX_LABEL}.
          </p>
          {field_errors.file && <p className="text-caption font-semibold text-danger">{field_errors.file}</p>}
        </div>
      )}

      {mode === 'link' && (
        <FormField
          field_id="resource-url"
          label="Link"
          type="url"
          placeholder="https://"
          hint="An article or a YouTube video with captions."
          required
          value={form_values.url}
          on_change={(new_value) => update_value('url', new_value)}
          error={field_errors.url}
        />
      )}

      <FormField
        field_id="resource-title"
        label={mode === 'text' ? 'Title' : 'Title (optional)'}
        required={mode === 'text'}
        value={form_values.title}
        on_change={(new_value) => update_value('title', new_value)}
        error={field_errors.title}
      />

      {mode === 'text' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="resource-text" className="text-small font-semibold text-ink">
            Notes
          </label>
          <textarea
            id="resource-text"
            rows={8}
            value={form_values.text}
            onChange={(change_event) => update_value('text', change_event.target.value)}
            aria-invalid={field_errors.text ? true : undefined}
            className="rounded-lg border border-border px-3 py-2.5 text-body"
          />
          {field_errors.text && <p className="text-caption font-semibold text-danger">{field_errors.text}</p>}
        </div>
      )}

      {!fixed_topic && topics.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="resource-topic" className="text-small font-semibold text-ink">
            Topic (optional)
          </label>
          <select
            id="resource-topic"
            value={form_values.topic_id}
            onChange={(change_event) => update_value('topic_id', change_event.target.value)}
            aria-describedby="resource-topic-hint"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
          >
            <option value="">None (the whole skill)</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.topic}
              </option>
            ))}
          </select>
          <p id="resource-topic-hint" className="text-caption text-ink-muted">
            Quizzes and notes on a topic use its own resources first.
          </p>
          {field_errors.topic_id && <p className="text-caption font-semibold text-danger">{field_errors.topic_id}</p>}
        </div>
      )}

      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      {is_saving && (
        <p role="status" className="text-small text-ink-muted">
          Reading your resource… recordings and long files can take a minute.
        </p>
      )}
      <button type="submit" disabled={is_saving} className={get_button_classes('primary', 'self-start')}>
        {is_saving ? 'Adding…' : 'Add resource'}
      </button>
    </form>
  );
}

// Popup for adding a resource to a skill, optionally filed under one of its topics.
// on_added(resource) runs with the saved resource.
function AddResourceDialog({ skill, topics, is_open, on_close, on_added }) {
  return (
    <Dialog title={`Add a resource to ${skill.name}`} is_open={is_open} on_close={on_close}>
      <AddResourceForm skill={skill} topics={topics} on_added={on_added} />
    </Dialog>
  );
}

export default AddResourceDialog;
