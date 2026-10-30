import { Navigate, Outlet, useLocation } from 'react-router';
import { ROUTE_PATHS } from '../config/constants.js';
import { AUTH_STATUS, use_auth } from '../context/AuthContext.jsx';
import { has_learning_profile } from '../services/learning_quiz_service.js';
import LoadingScreen from './LoadingScreen.jsx';

// Where a student goes after signing in. In order: the page they were trying to reach,
// the learning style quiz (only right after sign-up, and only if it hasn't been taken),
// otherwise the dashboard. The quiz can be skipped, so logging in never forces it.
export function get_guest_redirect_path({ from_path, account, offer_learning_quiz }) {
  if (from_path) return from_path;
  if (offer_learning_quiz && !has_learning_profile(account)) return ROUTE_PATHS.learning_quiz;
  return ROUTE_PATHS.dashboard;
}

// Wraps pages that need a login. Logged-out students go to the login page, which sends
// them back here afterwards (the original path and its ?skill=... ride along in the
// navigation state).
export function RequireAuth() {
  const { status } = use_auth();
  const location = useLocation();

  if (status === AUTH_STATUS.loading) return <LoadingScreen />;
  if (status === AUTH_STATUS.signed_out) {
    return <Navigate to={ROUTE_PATHS.log_in} replace state={{ from_path: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

// Wraps the login and sign-up pages. Once a student is signed in (including the moment
// they finish signing up or logging in) it moves them on; see get_guest_redirect_path.
// offer_learning_quiz is set on the sign-up route so new students see the quiz next.
export function RequireGuest({ offer_learning_quiz = false }) {
  const { status, account } = use_auth();
  const location = useLocation();

  if (status === AUTH_STATUS.loading) return <LoadingScreen />;
  if (status === AUTH_STATUS.signed_in) {
    const target_path = get_guest_redirect_path({
      from_path: location.state?.from_path,
      account,
      offer_learning_quiz,
    });
    return <Navigate to={target_path} replace />;
  }
  return <Outlet />;
}
