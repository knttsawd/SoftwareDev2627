import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PublicNavbar from '../../src/components/PublicNavbar.jsx';
import { AUTH_STATUS } from '../../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from '../helpers/render_helpers.jsx';
import { TEST_ACCOUNT } from '../helpers/test_data.js';

describe('PublicNavbar', () => {
  it('offers About us, Log in and Sign up to visitors', () => {
    render_in_router(<PublicNavbar />);

    const main_nav = screen.getByRole('navigation', { name: 'Main' });
    expect(main_nav).toContainElement(screen.getByRole('link', { name: 'About us' }));
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
  });

  it('offers the dashboard instead to logged-in students', () => {
    render_in_router(<PublicNavbar />, {
      auth_value: create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT }),
    });

    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });
});
