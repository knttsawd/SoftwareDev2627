import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { delete_account } from '../../services/account_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import Dialog from '../Dialog.jsx';
import FormField from '../FormField.jsx';

// What deleting the account removes, listed in the popup so nothing comes as a surprise.
export const DELETED_ITEMS = [
  'Your skills, topics and every resource you uploaded',
  'Your notes, quizzes and results',
  'Your chats and lessons with the AI student',
  'Your guided lessons, practice, reading places and key terms',
  'Your schedule and work blocks',
];

// The popup's form: the password confirms it really is the student. on_deleted() runs
// once the server has deleted everything.
function DeleteAccountForm({ on_cancel, on_deleted }) {
  const [password, set_password] = useState('');
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_deleting, set_is_deleting] = useState(false);

  async function handle_delete(submit_event) {
    submit_event.preventDefault();
    set_is_deleting(true);
    set_field_errors({});
    set_form_error('');
    try {
      await delete_account(password);
      on_deleted();
    } catch (delete_error) {
      set_field_errors(delete_error.field_errors ?? {});
      set_form_error(delete_error.field_errors?.password ? '' : delete_error.message);
      set_is_deleting(false);
    }
  }

  return (
    <form onSubmit={handle_delete} noValidate className="flex flex-col gap-4">
      <p className="text-body text-ink">This deletes your account for good, including:</p>
      <ul className="ml-5 list-disc text-body text-ink">
        {DELETED_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-body font-semibold text-ink">This can't be undone.</p>
      <FormField
        field_id="delete-password"
        label="Your password"
        type="password"
        autoComplete="current-password"
        value={password}
        on_change={set_password}
        error={field_errors.password}
      />
      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={is_deleting} className={get_button_classes('danger')}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {is_deleting ? 'Deleting…' : 'Delete my account'}
        </button>
        <button type="button" onClick={on_cancel} className={get_button_classes('secondary')}>
          Keep my account
        </button>
      </div>
    </form>
  );
}

// The "Delete account" part of Settings: a button that opens a confirmation popup.
function DeleteAccountSection({ on_deleted }) {
  const [is_open, set_is_open] = useState(false);

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-body text-ink-muted">Delete your account and everything in it.</p>
      <button type="button" onClick={() => set_is_open(true)} className={get_button_classes('danger')}>
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        Delete my account
      </button>
      <Dialog title="Delete your account?" is_open={is_open} on_close={() => set_is_open(false)}>
        <DeleteAccountForm on_cancel={() => set_is_open(false)} on_deleted={on_deleted} />
      </Dialog>
    </div>
  );
}

export default DeleteAccountSection;
