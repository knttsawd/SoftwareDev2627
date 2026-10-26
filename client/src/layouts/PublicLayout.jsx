import { Suspense } from 'react';
import { Outlet } from 'react-router';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PublicNavbar from '../components/PublicNavbar.jsx';
import { APP_NAME, MAIN_CONTENT_ID } from '../config/constants.js';

// Navbar, page content and footer for the homepage, sign-up and login pages.
// Suspense shows the loading screen while a page's code downloads the first time.
function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 focus:outline-none">
        <Suspense fallback={<LoadingScreen />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-border bg-surface">
        <p className="mx-auto max-w-6xl px-4 py-6 text-small text-ink-muted">
          {APP_NAME}: learn new skills from the resources you already have.
        </p>
      </footer>
    </div>
  );
}

export default PublicLayout;
