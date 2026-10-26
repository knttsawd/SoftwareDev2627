import { useState } from 'react';
import { create_event, update_event } from '../../services/schedule_service.js';
import { combine_date_and_time, to_date_input_value, to_time_input_value } from '../../utils/dates.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import Dialog from '../Dialog.jsx';
import FormField from '../FormField.jsx';

const DEFAULT_START_TIME = '17:00';
const DEFAULT_END_TIME = '18:00';

// The form's starting values: the event's own when editing, otherwise default_date at
// the default times with no subject.
export function build_initial_event_values(event, default_date) {
  if (!event) {
    return {
      title: '',
      skill_id: '',
      date: to_date_input_value(default_date),
      start_time: DEFAULT_START_TIME,
      end_time: DEFAULT_END_TIME,
      details: '',
    };
  }
  const starts_at = new Date(event.starts_at);
  return {
    title: event.title,
    skill_id: event.skill_id ?? '',
    date: to_date_input_value(starts_at),
    start_time: to_time_input_value(starts_at),
    end_time: to_time_input_value(new Date(event.ends_at)),
    details: event.details ?? '',
  };
}

// Form values -> the API body, with times as ISO date-times in the student's time zone.
export function build_event_request(form_values) {
  return {
    title: form_values.title,
    skill_id: form_values.skill_id || null,
    starts_at: combine_date_and_time(form_values.date, form_values.start_time).toISOString(),
    ends_at: combine_date_and_time(form_values.date, form_values.end_time).toISOString(),
    details: form_values.details,
  };
}

// The add/edit form, kept separate so it starts fresh each time the dialog opens.
function EventForm({ event, skills, default_date, on_saved }) {
  const [form_values, set_form_values] = useState(() => build_initial_event_values(event, default_date));
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_saving, set_is_saving] = useState(false);

  function update_value(field_name, new_value) {
    set_form_values((current_values) => ({ ...current_values, [field_name]: new_value }));
  }

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_is_saving(true);
    set_form_error('');
    set_field_errors({});
    try {
      const event_request = build_event_request(form_values);
      on_saved(event ? await update_event(event.id, event_request) : await create_event(event_request));
    } catch (save_error) {
      set_field_errors(save_error.field_errors ?? {});
      set_form_error(save_error.message);
      set_is_saving(false);
    }
  }

  return (
    <form onSubmit={handle_submit} noValidate className="flex flex-col gap-4">
      <FormField
        field_id="event-title"
        label="What are you doing?"
        placeholder="e.g. Biology essay, Chapter 4 review"
        required
        value={form_values.title}
        on_change={(new_value) => update_value('title', new_value)}
        error={field_errors.title}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-subject" className="text-small font-semibold text-ink">
          Subject
        </label>
        <select
          id="event-subject"
          value={form_values.skill_id}
          onChange={(change_event) => update_value('skill_id', change_event.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
        >
          <option value="">No subject</option>
          {skills.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          field_id="event-date"
          label="Date"
          type="date"
          required
          value={form_values.date}
          on_change={(new_value) => update_value('date', new_value)}
        />
        <FormField
          field_id="event-start"
          label="Starts"
          type="time"
          required
          value={form_values.start_time}
          on_change={(new_value) => update_value('start_time', new_value)}
          error={field_errors.starts_at}
        />
        <FormField
          field_id="event-end"
          label="Ends"
          type="time"
          required
          value={form_values.end_time}
          on_change={(new_value) => update_value('end_time', new_value)}
          error={field_errors.ends_at}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-details" className="text-small font-semibold text-ink">
          Details (optional)
        </label>
        <textarea
          id="event-details"
          rows={3}
          value={form_values.details}
          onChange={(change_event) => update_value('details', change_event.target.value)}
          className="rounded-lg border border-border px-3 py-2.5 text-body"
        />
      </div>
      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      <button type="submit" disabled={is_saving} className={get_button_classes('primary', 'self-start')}>
        {is_saving ? 'Saving…' : event ? 'Save changes' : 'Add to schedule'}
      </button>
    </form>
  );
}

// Popup for adding (event is null) or editing an event. on_saved(event) gets the saved event.
function EventDialog({ is_open, event, skills, default_date, on_close, on_saved }) {
  return (
    <Dialog title={event ? 'Edit event' : 'Add to your schedule'} is_open={is_open} on_close={on_close}>
      <EventForm event={event} skills={skills} default_date={default_date} on_saved={on_saved} />
    </Dialog>
  );
}

export default EventDialog;
