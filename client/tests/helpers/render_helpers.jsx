import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AUTH_STATUS, AuthContext } from '../../src/context/AuthContext.jsx';
import { ThemeProvider } from '../../src/context/ThemeContext.jsx';

// A stand-in for what AuthProvider gives components. Defaults to logged out; pass
// overrides such as { status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT }.
export function create_auth_value(overrides = {}) {
  return {
    account: null,
    status: AUTH_STATUS.signed_out,
    sign_up: vi.fn(),
    log_in: vi.fn(),
    log_out: vi.fn().mockResolvedValue(undefined),
    set_account: vi.fn(),
    forget_account: vi.fn(),
    ...overrides,
  };
}

// Renders routes in an in-memory router with a fake login state and the real theme. initial_path may include
// a query string ("/dashboard/skill-map?skill=s2"). Returns the router (to check
// router.state.location) along with the usual render result.
export function render_with_routes(
  routes,
  { auth_value = create_auth_value(), initial_path = '/', initial_state = null } = {},
) {
  const { pathname, search } = new URL(initial_path, 'http://localhost');
  const router = createMemoryRouter(routes, {
    initialEntries: [{ pathname, search, state: initial_state }],
  });
  const render_result = render(
    <ThemeProvider>
      <AuthContext.Provider value={auth_value}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </ThemeProvider>,
  );
  return { router, ...render_result };
}

// Renders a single element at every path, for components that just need a router around them.
export function render_in_router(element, options) {
  return render_with_routes([{ path: '*', element }], options);
}
