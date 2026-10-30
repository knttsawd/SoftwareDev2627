import { useEffect, useRef } from 'react';

// After moving to a new page, puts keyboard and screen reader focus on the element with
// target_id (the page's <main>), so they start reading the new page instead of staying
// on the link they clicked. Skipped on the first page load, where the browser handles focus.
export function use_focus_on_navigation(pathname, target_id) {
  const previous_pathname = useRef(pathname);

  useEffect(() => {
    if (pathname === previous_pathname.current) return;
    previous_pathname.current = pathname;
    document.getElementById(target_id)?.focus();
  }, [pathname, target_id]);
}
