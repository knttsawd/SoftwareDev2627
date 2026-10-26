import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AUTH_STATUS } from '../../src/context/AuthContext.jsx';
import HomePage from '../../src/pages/HomePage.jsx';
import NotFoundPage from '../../src/pages/NotFoundPage.jsx';
import { create_auth_value, render_in_router } from '../helpers/render_helpers.jsx';
import { TEST_ACCOUNT } from '../helpers/test_data.js';

describe('HomePage', () => {
  it('explains StudyApp and links to sign up and log in', () => {
    render_in_router(<HomePage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('resources you already have');
    for (const sign_up_link of screen.getAllByRole('link', { name: 'Create a free account' })) {
      expect(sign_up_link).toHaveAttribute('href', '/signup');
    }
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('sends signed-in students back to their dashboard instead', () => {
    render_in_router(<HomePage />, { auth_value: create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT }) });

    expect(screen.getAllByRole('link', { name: 'Go to your dashboard' })[0]).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'Create a free account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('has an About us section explaining why to create an account', () => {
    render_in_router(<HomePage />);

    const about_heading = screen.getByRole('heading', { level: 2, name: 'About us' });
    expect(about_heading.closest('section')).toHaveAttribute('id', 'about');
    expect(screen.getByRole('heading', { name: 'Progress without the pressure' })).toBeInTheDocument();
  });

  it('describes the preview image in its alt text', () => {
    render_in_router(<HomePage />);

    expect(screen.getByRole('img', { name: /Example skill map for Biology/ })).toBeInTheDocument();
  });
});

describe('NotFoundPage', () => {
  it('says the page was not found and links home', () => {
    render_in_router(<NotFoundPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the homepage' })).toHaveAttribute('href', '/');
  });
});
