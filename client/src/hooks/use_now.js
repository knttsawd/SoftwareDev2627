import { useEffect, useState } from 'react';

// The current time, refreshed every interval_ms while is_active is true. Used by the
// work block timer to redraw once a second.
export function use_now(interval_ms, is_active = true) {
  const [now, set_now] = useState(() => new Date());

  useEffect(() => {
    if (!is_active) return undefined;
    set_now(new Date());
    const refresh_timer = setInterval(() => set_now(new Date()), interval_ms);
    return () => clearInterval(refresh_timer);
  }, [interval_ms, is_active]);

  return now;
}
