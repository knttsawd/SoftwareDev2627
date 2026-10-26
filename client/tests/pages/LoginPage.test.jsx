import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SIGN_OUT_REASONS } from '../../src/context/AuthContext.jsx';
import LoginPage from '../../src/pages/LoginPage.jsx';
import { create_auth_value, render_in_router } from '../helpers/render_helpers.jsx';

// Types an email and password and presses Log in.
async function submit_login(email, password) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('LoginPage', () => {
  it('logs in with the typed email and password', async () => {
    const auth_value = create_auth_value({ log_in: vi.fn().mockResolvedValue(undefined) });
    render_in_router(<LoginPage />, { auth_value });

    await submit_login('sam@example.com', 'correct horse');

    expect(auth_value.log_in).toHaveBeenCalledWith('sam@example.com', 'correct horse');
  });

  it('shows the error when the login fails', async () => {
    const log_in = vi.fn().mockRejectedValue(new Error('Incorrect email or password'));
    render_in_router(<LoginPage />, { auth_value: create_auth_value({ log_in }) });

    await submit_login('sam@example.com', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('says why the student was signed out, when it wasn\'t their choice', () => {
    render_in_router(<LoginPage />, { auth_value: create_auth_value({ sign_out_reason: SIGN_OUT_REASONS.session_ended }) });
    expect(screen.getByRole('status')).toHaveTextContent('Your session ended');
  });

  it('links to sign up', () => {
    render_in_router(<LoginPage />);

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup');
  });
});
