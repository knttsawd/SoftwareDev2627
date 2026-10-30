import { useEffect } from 'react';

// Calls on_escape when the Escape key is pressed, but only while is_active is true.
// Used to close the mobile menu from the keyboard.
export function use_escape_key(is_active, on_escape) {
  useEffect(() => {
    if (!is_active) return undefined;
    function handle_key_down(key_event) {
      if (key_event.key === 'Escape') on_escape();
    }
    window.addEventListener('keydown', handle_key_down);
    return () => window.removeEventListener('keydown', handle_key_down);
  }, [is_active, on_escape]);
}
