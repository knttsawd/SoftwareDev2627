import { Link } from 'react-router';
import { ROUTE_PATHS } from '../config/constants.js';
import { AUTH_STATUS, use_auth } from '../context/AuthContext.jsx';
import { get_button_classes } from './button_styles.js';
import Logo from './Logo.jsx';

// Top bar on public pages. Logged-out visitors see Log in / Sign up; logged-in students
// get a shortcut back to their dashboard instead.
function PublicNavbar() {
  const { status } = use_auth();
  const is_signed_in = status === AUTH_STATUS.signed_in;

  return (
    <header className="border-b border-border bg-surface">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Logo to_path={ROUTE_PATHS.home} />
        <ul className="flex items-center gap-1 sm:gap-2">
          <li className="hidden sm:block">
            <a href={`${ROUTE_PATHS.home}#about`} className={get_button_classes('ghost')}>
              About us
            </a>
          </li>
          {is_signed_in ? (
            <li>
              <Link to={ROUTE_PATHS.dashboard} className={get_button_classes('primary')}>
                Go to dashboard
              </Link>
            </li>
          ) : (
            <>
              <li>
                <Link to={ROUTE_PATHS.log_in} className={get_button_classes('ghost')}>
                  Log in
                </Link>
              </li>
              <li>
                <Link to={ROUTE_PATHS.sign_up} className={get_button_classes('primary')}>
                  Sign up
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </header>
  );
}

export default PublicNavbar;
