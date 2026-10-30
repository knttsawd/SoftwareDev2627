import { Menu } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import AssistantLauncher from '../components/assistant/AssistantLauncher.jsx';
import { get_button_classes } from '../components/button_styles.js';
import LearningQuizReminder from '../components/LearningQuizReminder.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import Logo from '../components/Logo.jsx';
import Sidebar from '../components/Sidebar.jsx';
import FloatingWidgets from '../components/widgets/FloatingWidgets.jsx';
import WidgetShelf from '../components/widgets/WidgetShelf.jsx';
import { MAIN_CONTENT_ID, ROUTE_PATHS } from '../config/constants.js';
import { AssistantProvider } from '../context/AssistantContext.jsx';
import { use_escape_key } from '../hooks/use_escape_key.js';
import { start_data_sync } from '../utils/data_events.js';

const SIDEBAR_ID = 'dashboard-sidebar';

// Sidebar plus page content for every dashboard page, with the learning style quiz
// reminder, the widgets docked above the page or floating over it, and the assistant's
// button in the corner. On phones the sidebar becomes a drawer opened by the Menu button
// and closed by its X button, the backdrop, Escape, or choosing a page.
function DashboardLayout() {
  const [is_menu_open, set_is_menu_open] = useState(false);
  const close_menu = useCallback(() => set_is_menu_open(false), []);
  use_escape_key(is_menu_open, close_menu);
  // Keeps what's on screen current with saves in other tabs and after time away.
  useEffect(() => start_data_sync(), []);

  return (
    <AssistantProvider>
      <div className="min-h-screen lg:flex">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
          <Logo to_path={ROUTE_PATHS.dashboard} />
          <button
            type="button"
            aria-expanded={is_menu_open}
            aria-controls={SIDEBAR_ID}
            onClick={() => set_is_menu_open(true)}
            className={get_button_classes('secondary', 'px-3')}
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
            Menu
          </button>
        </header>

        {is_menu_open && (
          <div aria-hidden="true" onClick={close_menu} className="fixed inset-0 z-30 bg-backdrop/40 lg:hidden" />
        )}
        <Sidebar sidebar_id={SIDEBAR_ID} is_open={is_menu_open} on_close={close_menu} />

        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0 flex-1 px-4 pb-24 pt-6 focus:outline-none sm:px-8 lg:pt-10">
          <div className="relative mx-auto w-full max-w-6xl">
            <LearningQuizReminder />
            <WidgetShelf />
            <FloatingWidgets />
            <Suspense fallback={<LoadingScreen is_full_screen={false} />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <AssistantLauncher />
    </AssistantProvider>
  );
}

export default DashboardLayout;
