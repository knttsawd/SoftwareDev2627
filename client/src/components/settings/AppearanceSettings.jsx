import { Monitor, Moon, Sun } from 'lucide-react';
import { use_theme } from '../../context/ThemeContext.jsx';
import { THEME_CHOICES } from '../../utils/theme.js';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };

// Light, dark, or matching the device. A real radio group, so arrow keys move between the
// choices; the chosen one is marked by its border, a tint and the checked radio itself.
function AppearanceSettings() {
  const { choice, choose_theme } = use_theme();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Theme</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {THEME_CHOICES.map(({ id, label }) => {
          const ThemeIcon = THEME_ICONS[id];
          const is_chosen = id === choice;
          return (
            <label
              key={id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-body ${is_chosen ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : 'border-border text-ink hover:bg-canvas'}`}
            >
              <input
                type="radio"
                name="theme"
                value={id}
                checked={is_chosen}
                onChange={() => choose_theme(id)}
                className="h-4 w-4 accent-brand-600"
              />
              <ThemeIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default AppearanceSettings;
