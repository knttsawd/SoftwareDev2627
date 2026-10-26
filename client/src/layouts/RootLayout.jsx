import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { MAIN_CONTENT_ID, PAGE_TRANSITION_MS } from '../config/constants.js';
import { use_focus_on_navigation } from '../hooks/use_focus_on_navigation.js';
import { use_page_transition } from '../hooks/use_page_transition.js';

// The part of the site a path belongs to: "dashboard", "login", "signup", or "" for the homepage.
export function get_path_area(pathname) {
  return pathname.split('/')[1] ?? '';
}

// Wraps every page: the "skip to main content" link for keyboard users, scroll-to-top on
// navigation, and moving focus to the new page. Moving to another part of the site (logging
// in, opening the dashboard) shows the loading screen; moving between pages within one
// part runs a thin bar across the top instead, so the sidebar and page never blank out.
function RootLayout() {
  const { pathname } = useLocation();
  const is_changing_area = use_page_transition(get_path_area(pathname), PAGE_TRANSITION_MS);
  const is_changing_page = use_page_transition(pathname, PAGE_TRANSITION_MS);
  use_focus_on_navigation(pathname, MAIN_CONTENT_ID);

  return (
    <>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-brand-700 focus:shadow"
      >
        Skip to main content
      </a>
      <ScrollRestoration />
      {is_changing_page && !is_changing_area && (
        <div aria-hidden="true" key={pathname} className="fixed inset-x-0 top-0 z-[70] h-1">
          <div className="h-full animate-page-progress rounded-r-full bg-brand-600" />
        </div>
      )}
      <Outlet />
      {is_changing_area && <LoadingScreen />}
    </>
  );
}

export default RootLayout;
