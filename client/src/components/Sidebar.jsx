import { LogOut, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { ROUTE_PATHS } from '../config/constants.js';
import { DASHBOARD_PAGES } from '../config/dashboard_pages.js';
import { use_auth } from '../context/AuthContext.jsx';
import { get_button_classes } from './button_styles.js';
import Logo from './Logo.jsx';

const NAV_LINK_BASE_CLASSES =
  'flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-body transition-colors';
const NAV_LINK_ACTIVE_CLASSES = 'border-brand-600 bg-brand-50 font-semibold text-brand-800';
const NAV_LINK_IDLE_CLASSES = 'border-transparent text-ink-muted hover:bg-canvas hover:text-ink';

// The current page is marked by a left bar, bold text and aria-current (set by NavLink),
// not by color alone.
export function get_nav_link_classes({ isActive }) {
  return `${NAV_LINK_BASE_CLASSES} ${isActive ? NAV_LINK_ACTIVE_CLASSES : NAV_LINK_IDLE_CLASSES}`;
}

// Dashboard navigation. Always visible on large screens; on phones it is a drawer that
// DashboardLayout opens with the Menu button (is_open) and closes with on_close.
// "hidden" (not just moved off-screen) keeps the closed drawer's links out of the tab order.
function Sidebar({ sidebar_id, is_open, on_close }) {
  const { account, log_out } = use_auth();
  const navigate = useNavigate();
  const close_button_ref = useRef(null);

  // Moves keyboard focus into the drawer when it opens, so the next Tab lands on its links.
  useEffect(() => {
    if (is_open) close_button_ref.current?.focus();
  }, [is_open]);

  // Leaves the dashboard first, so the login guard does not redirect to the login page.
  // The local session is cleared even if the server cannot be reached, so that error is ignored.
  async function handle_log_out() {
    navigate(ROUTE_PATHS.home);
    await log_out().catch(() => {});
  }

  return (
    <aside
      id={sidebar_id}
      aria-label="Dashboard sidebar"
      className={`${is_open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-72 flex-col gap-6 overflow-y-auto border-r border-border bg-surface p-4 lg:sticky lg:top-0 lg:flex lg:h-screen`}
    >
      <div className="flex items-center justify-between">
        <Logo to_path={ROUTE_PATHS.dashboard} />
        <button
          ref={close_button_ref}
          type="button"
          onClick={on_close}
          className={get_button_classes('ghost', 'px-2 lg:hidden')}
        >
          <X aria-hidden="true" className="h-5 w-5" />
          <span className="sr-only">Close menu</span>
        </button>
      </div>

      <nav aria-label="Dashboard">
        <ul className="flex flex-col gap-1">
          {DASHBOARD_PAGES.map((page) => (
            <li key={page.path}>
              <NavLink to={`${ROUTE_PATHS.dashboard}/${page.path}`} onClick={on_close} className={get_nav_link_classes}>
                <page.icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                {page.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
        <p className="text-small text-ink-muted">
          Signed in as <span className="font-semibold text-ink">{account.first_name}</span> (@{account.username})
        </p>
        <button type="button" onClick={handle_log_out} className={get_button_classes('secondary')}>
          <LogOut aria-hidden="true" className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
