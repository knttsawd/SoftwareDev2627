import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Sidebar, { get_nav_link_classes } from '../../src/components/Sidebar.jsx';
import { AUTH_STATUS } from '../../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from '../helpers/render_helpers.jsx';
import { TEST_ACCOUNT } from '../helpers/test_data.js';

// Renders the sidebar for the signed-in test student at the given dashboard page.
function render_sidebar({ is_open = false, on_close = vi.fn(), initial_path = '/dashboard/quiz' } = {}) {
  const auth_value = create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT });
  const render_result = render_in_router(<Sidebar sidebar_id="sidebar" is_open={is_open} on_close={on_close} />, {
    auth_value,
    initial_path,
  });
  return { auth_value, on_close, ...render_result };
}

describe('get_nav_link_classes', () => {
  it('marks the active link with a bar and bold text', () => {
    expect(get_nav_link_classes({ isActive: true })).toContain('font-semibold');
    expect(get_nav_link_classes({ isActive: false })).toContain('border-transparent');
  });
});

describe('Sidebar', () => {
  it('links to every dashboard page and marks the current one', () => {
    render_sidebar();

    const dashboard_nav = screen.getByRole('navigation', { name: 'Dashboard' });
    expect(dashboard_nav.querySelectorAll('a')).toHaveLength(8);
    expect(screen.getByRole('link', { name: 'Quiz' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Skill map' })).not.toHaveAttribute('aria-current');
  });

  it('shows who is signed in', () => {
    render_sidebar();

    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Signed in as Sam (@study_sam)');
  });

  it('closes the mobile drawer after choosing a page', async () => {
    const { on_close } = render_sidebar({ is_open: true });

    await userEvent.click(screen.getByRole('link', { name: 'Schedule' }));

    expect(on_close).toHaveBeenCalled();
  });

  it('moves focus into the drawer when it opens', () => {
    render_sidebar({ is_open: true });

    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus();
  });

  it('goes to the homepage and logs out', async () => {
    const { auth_value, router } = render_sidebar();

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(auth_value.log_out).toHaveBeenCalled();
  });
});
