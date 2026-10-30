import { useEffect, useState } from 'react';

// True while the window matches a CSS media query, e.g. "(min-width: 1024px)", updating
// when it starts or stops matching. False where matchMedia isn't available (like tests).
// media_window is injectable for tests.
export function use_media_query(query, media_window = window) {
  const [matches, set_matches] = useState(() => media_window.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const media_list = media_window.matchMedia?.(query);
    if (!media_list) return undefined;
    const update_matches = () => set_matches(media_list.matches);
    update_matches();
    media_list.addEventListener('change', update_matches);
    return () => media_list.removeEventListener('change', update_matches);
  }, [query, media_window]);

  return matches;
}
