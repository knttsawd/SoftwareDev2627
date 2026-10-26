import { Plus } from 'lucide-react';
import { get_button_classes } from './button_styles.js';

// The skill dropdown plus, when on_add_click is given, a button to add a new skill. The
// color dot next to the dropdown is decorative; the skill name always says which skill is chosen.
function SkillPicker({ skills, selected_skill_id, on_select, on_add_click }) {
  const selected_skill = skills.find((skill) => skill.id === selected_skill_id);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {skills.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="skill-picker" className="text-small font-semibold text-ink">
            Skill
          </label>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: selected_skill?.color }}
            />
            <select
              id="skill-picker"
              value={selected_skill_id ?? ''}
              onChange={(change_event) => on_select(change_event.target.value)}
              className="min-w-48 rounded-lg border border-border bg-surface px-3 py-2.5 text-body text-ink"
            >
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {on_add_click && (
        <button type="button" onClick={on_add_click} className={get_button_classes('secondary')}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          New skill
        </button>
      )}
    </div>
  );
}

export default SkillPicker;
