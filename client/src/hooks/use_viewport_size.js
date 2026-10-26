import { useEffect, useState } from 'react';

// The browser window's inner size, { width, height }, updating as it's resized.
// viewport_window is injectable for tests.
export function use_viewport_size(viewport_window = window) {
  const [size, set_size] = useState(() => ({ width: viewport_window.innerWidth, height: viewport_window.innerHeight }));

  useEffect(() => {
    function update_size() {
      set_size({ width: viewport_window.innerWidth, height: viewport_window.innerHeight });
    }
    viewport_window.addEventListener('resize', update_size);
    return () => viewport_window.removeEventListener('resize', update_size);
  }, [viewport_window]);

  return size;
}
