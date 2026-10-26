import { useState } from 'react';
import { update_skill } from '../../services/skill_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';

// One subject's color picker. Dragging a color picker fires many changes, so the new color
// is only saved when the student presses Save.
function SubjectColorRow({ skill, on_color_saved }) {
  const [color, set_color] = useState(skill.color);
  const [save_error, set_save_error] = useState('');
  const has_changed = color.toUpperCase() !== skill.color.toUpperCase();
  const input_id = `subject-color-${skill.id}`;

  async function handle_save() {
    set_save_error('');
    try {
      on_color_saved(await update_skill(skill.id, { color }));
    } catch (update_error) {
      set_save_error(update_error.message);
    }
  }

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <input
          id={input_id}
          type="color"
          value={color}
          onChange={(change_event) => set_color(change_event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface"
        />
        <label htmlFor={input_id} className="flex-1 text-small font-semibold text-ink">
          {skill.name} <span className="font-normal text-ink-muted">({color.toUpperCase()})</span>
        </label>
        {has_changed && (
          <button type="button" onClick={handle_save} className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}>
            Save
          </button>
        )}
      </div>
      {save_error && <AlertMessage>{save_error}</AlertMessage>}
    </li>
  );
}

// Each subject's color on the schedule. on_color_saved(skill) gets the updated skill.
function SubjectColorsPanel({ skills, on_color_saved }) {
  if (skills.length === 0) return null;
  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">Subject colors</summary>
      <ul className="flex flex-col gap-3 border-t border-border p-4">
        {skills.map((skill) => (
          <SubjectColorRow key={`${skill.id}-${skill.color}`} skill={skill} on_color_saved={on_color_saved} />
        ))}
      </ul>
    </details>
  );
}

export default SubjectColorsPanel;
