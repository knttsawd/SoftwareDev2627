import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { get_guest_redirect_path, RequireAuth, RequireGuest } from '../../src/components/RouteGuards.jsx';
import { AUTH_STATUS } from '../../src/context/AuthContext.jsx';
import { create_auth_value, render_with_routes } from '../helpers/render_helpers.jsx';
import { NEW_ACCOUNT, TEST_ACCOUNT } from '../helpers/test_data.js';

// Small route tree with each guard protecting a page, plus the pages they redirect to.
const GUARD_TEST_ROUTES = [
  { element: <RequireAuth />, children: [{ path: '/private', element: <p>private page</p> }] },
  { element: <RequireGuest offer_learning_quiz />, children: [{ path: '/signup', element: <p>signup page</p> }] },
  { element: <RequireGuest />, children: [{ path: '/login', element: <p>login page</p> }] },
  { path: '/dashboard', element: <p>dashboard page</p> },
  { path: '/dashboard/quiz', element: <p>quiz page</p> },
  { path: '/signup/learning-style', element: <p>learning quiz page</p> },
];

const SIGNED_IN = create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT });
const SIGNED_IN_NEW = create_auth_value({ status: AUTH_STATUS.signed_in, account: NEW_ACCOUNT });
const LOADING = create_auth_value({ status: AUTH_STATUS.loading });

describe('get_guest_redirect_path', () => {
  it('prefers the page the student was trying to reach', () => {
    expect(get_guest_redirect_path({ from_path: '/dashboard/quiz', account: NEW_ACCOUNT, offer_learning_quiz: true })).toBe(
      '/dashboard/quiz',
    );
  });

  it('offers the quiz after sign-up only when it has not been taken', () => {
    expect(get_guest_redirect_path({ account: NEW_ACCOUNT, offer_learning_quiz: true })).toBe('/signup/learning-style');
    expect(get_guest_redirect_path({ account: TEST_ACCOUNT, offer_learning_quiz: true })).toBe('/dashboard');
  });

  it('never forces the quiz after a normal login', () => {
    expect(get_guest_redirect_path({ account: NEW_ACCOUNT, offer_learning_quiz: false })).toBe('/dashboard');
  });
});

describe('RequireAuth', () => {
  it('shows the page to signed-in students', () => {
    render_with_routes(GUARD_TEST_ROUTES, { initial_path: '/private', auth_value: SIGNED_IN });

    expect(screen.getByText('private page')).toBeInTheDocument();
  });

  it('sends visitors to login, remembering where they were going', () => {
    const { router } = render_with_routes(GUARD_TEST_ROUTES, { initial_path: '/private' });

    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ from_path: '/private' });
  });

  it('shows the loading screen while the login is being checked', () => {
    render_with_routes(GUARD_TEST_ROUTES, { initial_path: '/private', auth_value: LOADING });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('RequireGuest', () => {
  it('shows the page to visitors', () => {
    render_with_routes(GUARD_TEST_ROUTES, { initial_path: '/login' });

    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends signed-in students back where they were going', () => {
    render_with_routes(GUARD_TEST_ROUTES, {
      initial_path: '/login',
      initial_state: { from_path: '/dashboard/quiz' },
      auth_value: SIGNED_IN,
    });

    expect(screen.getByText('quiz page')).toBeInTheDocument();
  });

  it('sends a student who just signed up to the learning quiz', () => {
    render_with_routes(GUARD_TEST_ROUTES, { initial_path: '/signup', auth_value: SIGNED_IN_NEW });

    expect(screen.getByText('learning quiz page')).toBeInTheDocument();
  });

  it('sends a student who skipped the quiz straight to the dashboard on login', () => {
    render_with_routes(GUARD_TEST_ROUTES, { initial_path: '/login', auth_value: SIGNED_IN_NEW });

    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });

  it('shows the loading screen while the login is being checked', () => {
    render_with_routes(GUARD_TEST_ROUTES, { initial_path: '/login', auth_value: LOADING });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
