import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create_auth_value, render_in_router } from '../helpers/render_helpers.jsx';

vi.mock('../../src/services/auth_service.js', () => ({ check_username_available: vi.fn() }));

const { check_username_available } = await import('../../src/services/auth_service.js');
const { default: SignUpPage } = await import('../../src/pages/SignUpPage.jsx');

// Fills in every sign-up field with valid details.
async function fill_sign_up_form() {
  await userEvent.type(screen.getByLabelText('First name'), 'Sam');
  await userEvent.type(screen.getByLabelText('Last name'), 'Lee');
  await userEvent.type(screen.getByLabelText('Username'), 'study_sam');
  await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
}

beforeEach(() => {
  vi.clearAllMocks();
  check_username_available.mockResolvedValue(true);
});

describe('SignUpPage', () => {
  it('is step 1 of 2', () => {
    render_in_router(<SignUpPage />);

    expect(screen.getByText('Step 1 of 2: Your details')).toBeInTheDocument();
  });

  it('sends every field to sign_up', async () => {
    const auth_value = create_auth_value({ sign_up: vi.fn().mockResolvedValue(undefined) });
    render_in_router(<SignUpPage />, { auth_value });

    await fill_sign_up_form();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(auth_value.sign_up).toHaveBeenCalledWith({
      first_name: 'Sam',
      last_name: 'Lee',
      username: 'study_sam',
      email: 'sam@example.com',
      password: 'correct horse',
    });
  });

  it('checks the username when leaving the field', async () => {
    render_in_router(<SignUpPage />);

    await userEvent.type(screen.getByLabelText('Username'), 'study_sam');
    await userEvent.tab();

    expect(check_username_available).toHaveBeenCalledWith('study_sam');
    expect(await screen.findByText('That username is available')).toBeInTheDocument();
  });

  it('shows an error when the username is taken', async () => {
    check_username_available.mockResolvedValue(false);
    render_in_router(<SignUpPage />);

    await userEvent.type(screen.getByLabelText('Username'), 'taken');
    await userEvent.tab();

    expect(await screen.findByText('That username is already taken')).toBeInTheDocument();
  });

  it('shows an invalid-username message from the server', async () => {
    check_username_available.mockRejectedValue(new Error('Username can only use letters, numbers and underscores'));
    render_in_router(<SignUpPage />);

    await userEvent.type(screen.getByLabelText('Username'), 'bad!');
    await userEvent.tab();

    expect(await screen.findByText('Username can only use letters, numbers and underscores')).toBeInTheDocument();
  });

  it('shows server errors next to the matching fields', async () => {
    const sign_up_error = new Error('An account with that email already exists');
    sign_up_error.field_errors = { email: 'An account with that email already exists' };
    render_in_router(<SignUpPage />, { auth_value: create_auth_value({ sign_up: vi.fn().mockRejectedValue(sign_up_error) }) });

    await fill_sign_up_form();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with that email already exists');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('can show the password', async () => {
    render_in_router(<SignUpPage />);

    await userEvent.click(screen.getByLabelText('Show password'));

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });
});
