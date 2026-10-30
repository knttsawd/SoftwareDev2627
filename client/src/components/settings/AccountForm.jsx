import { useState } from 'react';
import { update_account } from '../../services/account_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import FormField from '../FormField.jsx';

// One part of the account to edit, as a form. Each section of the Settings page passes:
//   fields          [{ name, label, type?, autoComplete?, hint?, min?, max? }]
//   initial_values  the starting value for each field, by name
//   build_updates(values) -> { updates, field_errors }: what to send (only what changed) or
//                   what's wrong; nothing to send means "nothing changed"
//   describe_success(updates) -> the message once saved
//   values_after_save(values) -> the form's values after saving (e.g. passwords cleared)
// on_saved(account) receives the updated account.
function AccountForm({ form_id, fields, initial_values, build_updates, describe_success, values_after_save, on_saved }) {
  const [values, set_values] = useState(initial_values);
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [status_message, set_status_message] = useState('');
  const [is_saving, set_is_saving] = useState(false);

  function update_value(field_name, new_value) {
    set_values((current_values) => ({ ...current_values, [field_name]: new_value }));
  }

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_field_errors({});
    set_form_error('');
    set_status_message('');
    const { updates, field_errors: local_errors } = build_updates(values);
    if (Object.keys(local_errors).length > 0) {
      set_field_errors(local_errors);
      return;
    }
    if (Object.keys(updates).length === 0) {
      set_status_message('Nothing has changed.');
      return;
    }
    set_is_saving(true);
    try {
      on_saved(await update_account(updates));
      set_values(values_after_save ? values_after_save(values) : values);
      set_status_message(describe_success(updates));
    } catch (save_error) {
      set_field_errors(save_error.field_errors ?? {});
      set_form_error(save_error.message);
    } finally {
      set_is_saving(false);
    }
  }

  return (
    <form onSubmit={handle_submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <FormField
            key={field.name}
            field_id={`${form_id}-${field.name}`}
            label={field.label}
            type={field.type ?? 'text'}
            autoComplete={field.autoComplete}
            hint={field.hint}
            min={field.min}
            max={field.max}
            value={values[field.name]}
            on_change={(new_value) => update_value(field.name, new_value)}
            error={field_errors[field.name]}
          />
        ))}
      </div>
      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      {status_message && <AlertMessage tone="success">{status_message}</AlertMessage>}
      <button type="submit" disabled={is_saving} className={get_button_classes('primary', 'self-start')}>
        {is_saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

export default AccountForm;
