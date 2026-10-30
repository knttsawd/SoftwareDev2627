import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AUTH_STATUS, use_auth } from '../../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router, render_with_routes } from './render_helpers.jsx';

// Shows the login status from context so the helpers can be checked.
function StatusProbe() {
  return <p>{use_auth().status}</p>;
}

describe('create_auth_value', () => {
  it('defaults to logged out and accepts overrides', () => {
    expect(create_auth_value().status).toBe(AUTH_STATUS.signed_out);
    expect(create_auth_value({ status: AUTH_STATUS.signed_in }).status).toBe(AUTH_STATUS.signed_in);
  });
});

describe('render_with_routes', () => {
  it('starts at the given path with the given login state', () => {
    const { router } = render_with_routes([{ path: '/login', element: <StatusProbe /> }], {
      initial_path: '/login',
      auth_value: create_auth_value({ status: AUTH_STATUS.loading }),
    });

    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByText('loading')).toBeInTheDocument();
  });
});

describe('render_in_router', () => {
  it('renders the element at any path', () => {
    render_in_router(<StatusProbe />, { initial_path: '/anything' });

    expect(screen.getByText('signed_out')).toBeInTheDocument();
  });
});
