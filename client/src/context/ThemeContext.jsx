import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { THEME_STORAGE_KEY } from '../config/constants.js';
import { use_media_query } from '../hooks/use_media_query.js';
import { save_device_value } from '../utils/device_storage.js';
import { apply_theme, DARK_SCHEME_QUERY, read_theme_choice, resolve_theme } from '../utils/theme.js';

const ThemeContext = createContext(null);

// Holds the light/dark choice for the whole app and keeps the page's colors in step with
// it: when the student changes it, when the device switches (for "Match my device"), and
// when it's changed in another open tab. media_window is injectable for tests.
export function ThemeProvider({ children, media_window }) {
  const [choice, set_choice] = useState(read_theme_choice);
  const prefers_dark = use_media_query(DARK_SCHEME_QUERY, media_window);
  const theme = resolve_theme(choice, prefers_dark);

  useEffect(() => {
    apply_theme(theme);
  }, [theme]);

  useEffect(() => {
    function handle_storage(storage_event) {
      if (storage_event.key === THEME_STORAGE_KEY) set_choice(read_theme_choice());
    }
    window.addEventListener('storage', handle_storage);
    return () => window.removeEventListener('storage', handle_storage);
  }, []);

  const choose_theme = useCallback((new_choice) => {
    save_device_value(THEME_STORAGE_KEY, new_choice);
    set_choice(new_choice);
  }, []);

  const theme_value = useMemo(() => ({ choice, theme, choose_theme }), [choice, theme, choose_theme]);
  return <ThemeContext.Provider value={theme_value}>{children}</ThemeContext.Provider>;
}

// Returns { choice, theme, choose_theme } from ThemeProvider: choice is one of
// THEME_CHOICES' ids, theme is "light" or "dark".
export function use_theme() {
  const theme_value = useContext(ThemeContext);
  if (!theme_value) throw new Error('use_theme must be used inside ThemeProvider');
  return theme_value;
}
