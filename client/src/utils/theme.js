import { THEME_STORAGE_KEY } from '../config/constants.js';
import { read_device_value } from './device_storage.js';

// Light and dark mode. The student's choice is kept on this device; "system" follows the
// device's own setting. index.html runs the same steps before the page first draws, so a
// dark page never flashes light while the app loads.

export const THEME_CHOICES = [
  { id: 'system', label: 'Match my device' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
export const DEFAULT_THEME_CHOICE = 'system';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

// The saved choice, or "system" when there is none (or it isn't one of THEME_CHOICES).
export function read_theme_choice() {
  const saved_choice = read_device_value(THEME_STORAGE_KEY);
  return THEME_CHOICES.some((theme_choice) => theme_choice.id === saved_choice) ? saved_choice : DEFAULT_THEME_CHOICE;
}

// "light" or "dark": the choice itself, or the device's setting for "system".
export function resolve_theme(choice, prefers_dark) {
  if (choice === DEFAULT_THEME_CHOICE) return prefers_dark ? 'dark' : 'light';
  return choice;
}

// Switches every color token over (see the dark set in theme.css).
export function apply_theme(theme, root_element = document.documentElement) {
  root_element.dataset.theme = theme;
}
