import { useEffect, useRef, useState } from 'react';

// Returns true for duration_ms after the page path changes, so the loading screen can
// show between pages. It stays false on the very first page load, and when duration_ms is 0.
export function use_page_transition(pathname, duration_ms) {
  const [is_transitioning, set_is_transitioning] = useState(false);
  const previous_pathname = useRef(pathname);

  useEffect(() => {
    if (pathname === previous_pathname.current || duration_ms <= 0) return undefined;
    previous_pathname.current = pathname;
    set_is_transitioning(true);
    const transition_timer = setTimeout(() => set_is_transitioning(false), duration_ms);
    return () => clearTimeout(transition_timer);
  }, [pathname, duration_ms]);

  return is_transitioning;
}
