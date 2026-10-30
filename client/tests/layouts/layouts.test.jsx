import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AUTH_STATUS } from '../../src/context/AuthContext.jsx';
import DashboardLayout from '../../src/layouts/DashboardLayout.jsx';
import PublicLayout from '../../src/layouts/PublicLayout.jsx';
import RootLayout from '../../src/layouts/RootLayout.jsx';
import { create_auth_value, render_with_routes } from '../helpers/render_helpers.jsx';
import { TEST_ACCOUNT } from '../helpers/test_data.js';

const SIGNED_IN = create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT });

describe('RootLayout', () => {
  const root_routes = [
    {
      element: <RootLayout />,
      children: [
        {
          element: <PublicLayout />,
          children: [
            { path: '/', element: <Link to="/next">Go to next page</Link> },
            { path: '/next', element: <p>next page</p> },
            { path: '/dashboard/one', element: <Link to="/dashboard/two">Go to page two</Link> },
            { path: '/dashboard/two', element: <p>page two</p> },
          ],
        },
      ],
    },
  ];

  it('offers a skip link to the main content', () => {
    render_with_routes(root_routes);

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
  });

  it('shows the loading screen between pages, then focuses the new page', async () => {
    render_with_routes(root_routes);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Go to next page' }));

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByText('next page')).toBeInTheDocument();
  });

  it('runs a bar across the top between pages of the same part, instead of the loading screen', async () => {
    const { container } = render_with_routes(root_routes, { initial_path: '/dashboard/one' });

    await userEvent.click(screen.getByRole('link', { name: 'Go to page two' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-page-progress')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.animate-page-progress')).not.toBeInTheDocument());
    expect(screen.getByText('page two')).toBeInTheDocument();
  });
});

describe('PublicLayout', () => {
  it('wraps the page in the navbar, a main region and a footer', () => {
    render_with_routes([{ element: <PublicLayout />, children: [{ path: '/', element: <p>home</p> }] }]);

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('home');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});

describe('DashboardLayout', () => {
  const dashboard_routes = [
    { element: <DashboardLayout />, children: [{ path: '/dashboard/quiz', element: <h1>Quiz</h1> }] },
  ];

  it('shows the sidebar and the page', () => {
    render_with_routes(dashboard_routes, { initial_path: '/dashboard/quiz', auth_value: SIGNED_IN });

    expect(screen.getByRole('navigation', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Quiz');
  });

  it('opens the mobile menu with the Menu button and closes it with Escape', async () => {
    render_with_routes(dashboard_routes, { initial_path: '/dashboard/quiz', auth_value: SIGNED_IN });
    const menu_button = screen.getByRole('button', { name: 'Menu' });
    expect(menu_button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(menu_button);
    expect(menu_button).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');
    expect(menu_button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the mobile menu with the close button', async () => {
    render_with_routes(dashboard_routes, { initial_path: '/dashboard/quiz', auth_value: SIGNED_IN });

    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
