import { useState } from 'react';
import { DEFAULT_SKILL_COLOR } from '../config/resource_types.js';
import { create_skill } from '../services/skill_service.js';
import AlertMessage from './AlertMessage.jsx';
import { get_button_classes } from './button_styles.js';
import Dialog from './Dialog.jsx';
import FormField from './FormField.jsx';

// The form inside the dialog, kept separate so it resets each time the dialog opens.
function CreateSkillForm({ on_created }) {
  const [name, set_name] = useState('');
  const [color, set_color] = useState(DEFAULT_SKILL_COLOR);
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_saving, set_is_saving] = useState(false);

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_is_saving(true);
    set_form_error('');
    try {
      on_created(await create_skill({ name, color }));
    } catch (save_error) {
      set_field_errors(save_error.field_errors ?? {});
      set_form_error(save_error.message);
      set_is_saving(false);
    }
  }

  return (
    <form onSubmit={handle_submit} noValidate className="flex flex-col gap-4">
      <FormField
        field_id="skill-name"
        label="Skill name"
        hint="For example: Biology, Spanish, Guitar, Python"
        required
        value={name}
        on_change={set_name}
        error={field_errors.name}
      />
      <div className="flex items-center gap-3">
        <input
          id="skill-color"
          type="color"
          value={color}
          onChange={(change_event) => set_color(change_event.target.value)}
          className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-surface"
        />
        <label htmlFor="skill-color" className="text-small font-semibold text-ink">
          Color on your schedule <span className="font-normal text-ink-muted">({color.toUpperCase()})</span>
        </label>
      </div>
      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      <button type="submit" disabled={is_saving} className={get_button_classes('primary', 'self-start')}>
        {is_saving ? 'Adding…' : 'Add skill'}
      </button>
    </form>
  );
}

// Popup for adding a skill. on_created(skill) runs with the saved skill.
function CreateSkillDialog({ is_open, on_close, on_created }) {
  return (
    <Dialog title="New skill" is_open={is_open} on_close={on_close}>
      <CreateSkillForm on_created={on_created} />
    </Dialog>
  );
}

export default CreateSkillDialog;
