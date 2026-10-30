import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STATUS } from '../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from './helpers/render_helpers.jsx';
import { NEW_ACCOUNT, SAMPLE_QUESTIONS, TEST_ACCOUNT } from './helpers/test_data.js';

vi.mock('../src/services/account_service.js', () => ({ update_account: vi.fn(), delete_account: vi.fn() }));
vi.mock('../src/services/learning_quiz_service.js', async (import_original) => ({
  ...(await import_original()),
  fetch_learning_quiz: vi.fn(),
  save_learning_profile: vi.fn(),
}));

const account_service = await import('../src/services/account_service.js');
const learning_quiz_service = await import('../src/services/learning_quiz_service.js');
const {
  build_profile_updates,
  build_sign_in_updates,
  build_timer_updates,
  describe_sign_in_success,
} = await import('../src/components/settings/account_updates.js');
const { describe_answer, NOT_ANSWERED } = await import('../src/components/settings/LearningProfileSettings.jsx');
const { DELETED_ITEMS } = await import('../src/components/settings/DeleteAccountSection.jsx');
const { default: SettingsPage } = await import('../src/pages/dashboard/SettingsPage.jsx');

// Renders the Settings page for an account, returning the auth value's spies and the router.
function render_settings(account = TEST_ACCOUNT) {
  const auth_value = create_auth_value({ status: AUTH_STATUS.signed_in, account });
  const { router } = render_in_router(<SettingsPage />, { auth_value, initial_path: '/dashboard/settings' });
  return { auth_value, router };
}

// The section of the page with this heading.
function get_section(heading_name) {
  return screen.getByRole('heading', { level: 2, name: heading_name }).closest('section');
}

beforeEach(() => {
  vi.clearAllMocks();
  learning_quiz_service.fetch_learning_quiz.mockResolvedValue(SAMPLE_QUESTIONS);
});

describe('account updates', () => {
  it('sends only the details that changed', () => {
    expect(build_profile_updates({ first_name: 'Sam ', last_name: 'Lee', username: 'sam_2' }, TEST_ACCOUNT)).toEqual({
      updates: { username: 'sam_2' },
      field_errors: {},
    });
  });

  it('sends a new email or password with the current password, and checks the new one twice', () => {
    const unchanged = { email: 'SAM@example.com', new_password: '', confirm_password: '', current_password: '' };

    expect(build_sign_in_updates(unchanged, TEST_ACCOUNT)).toEqual({ updates: {}, field_errors: {} });
    expect(build_sign_in_updates({ ...unchanged, new_password: 'new pass 1', confirm_password: 'new pass 1', current_password: 'old' }, TEST_ACCOUNT)).toEqual({
      updates: { password: 'new pass 1', current_password: 'old' },
      field_errors: {},
    });
    expect(build_sign_in_updates({ ...unchanged, email: 'alex@example.com', current_password: 'old' }, TEST_ACCOUNT).updates).toEqual({
      email: 'alex@example.com',
      current_password: 'old',
    });
    expect(build_sign_in_updates({ ...unchanged, new_password: 'a', confirm_password: 'b' }, TEST_ACCOUNT).field_errors).toEqual({
      confirm_password: "The new passwords don't match",
    });
  });

  it('turns the timer fields into numbers, sending only changes', () => {
    expect(build_timer_updates({ work_minutes: '25', break_minutes: '10' }, TEST_ACCOUNT).updates).toEqual({ break_minutes: 10 });
    expect(build_timer_updates({ work_minutes: '', break_minutes: '5' }, TEST_ACCOUNT).updates).toEqual({ work_minutes: null });
  });

  it('says what happened after a sign-in change', () => {
    expect(describe_sign_in_success({ password: 'x' })).toMatch('logged out everywhere else');
    expect(describe_sign_in_success({ email: 'x' })).toBe('Your new email is saved.');
  });
});

describe('describe_answer', () => {
  it('writes each kind of answer in words', () => {
    const [single_question, multiple_question, text_question] = SAMPLE_QUESTIONS;

    expect(describe_answer(single_question, 'visual')).toBe('Seeing it');
    expect(describe_answer(multiple_question, ['morning', 'evening'])).toBe('Morning, Evening');
    expect(describe_answer(text_question, 'Pass biology')).toBe('Pass biology');
    expect(describe_answer(text_question, ' ')).toBe(NOT_ANSWERED);
    expect(describe_answer(single_question, undefined)).toBe(NOT_ANSWERED);
  });
});

describe('SettingsPage', () => {
  it('saves new details and updates the signed-in account', async () => {
    account_service.update_account.mockResolvedValue({ ...TEST_ACCOUNT, first_name: 'Alex' });
    const { auth_value } = render_settings();
    const profile = get_section('Your details');

    await userEvent.clear(within(profile).getByLabelText('First name'));
    await userEvent.type(within(profile).getByLabelText('First name'), 'Alex');
    await userEvent.click(within(profile).getByRole('button', { name: 'Save changes' }));

    expect(account_service.update_account).toHaveBeenCalledWith({ first_name: 'Alex' });
    expect(auth_value.set_account).toHaveBeenCalledWith({ ...TEST_ACCOUNT, first_name: 'Alex' });
    expect(await within(profile).findByRole('alert')).toHaveTextContent('Your details are saved.');
  });

  it('says when nothing changed, without calling the server', async () => {
    render_settings();
    const timer = get_section('Focus timer');

    await userEvent.click(within(timer).getByRole('button', { name: 'Save changes' }));

    expect(within(timer).getByRole('alert')).toHaveTextContent('Nothing has changed.');
    expect(account_service.update_account).not.toHaveBeenCalled();
  });

  it('changes the password with the current one, then clears the password fields', async () => {
    account_service.update_account.mockResolvedValue(TEST_ACCOUNT);
    render_settings();
    const sign_in = get_section('Email and password');

    await userEvent.type(within(sign_in).getByLabelText('Current password'), 'correct horse');
    await userEvent.type(within(sign_in).getByLabelText('New password'), 'a new password');
    await userEvent.type(within(sign_in).getByLabelText('New password again'), 'a new password');
    await userEvent.click(within(sign_in).getByRole('button', { name: 'Save changes' }));

    expect(account_service.update_account).toHaveBeenCalledWith({ password: 'a new password', current_password: 'correct horse' });
    expect(await within(sign_in).findByRole('alert')).toHaveTextContent('logged out everywhere else');
    expect(within(sign_in).getByLabelText('New password')).toHaveValue('');
  });

  it('shows server errors next to the fields', async () => {
    const save_error = Object.assign(new Error('Please fix the highlighted fields'), {
      field_errors: { current_password: "That isn't your current password" },
    });
    account_service.update_account.mockRejectedValue(save_error);
    render_settings();
    const sign_in = get_section('Email and password');

    await userEvent.clear(within(sign_in).getByLabelText('Email'));
    await userEvent.type(within(sign_in).getByLabelText('Email'), 'alex@example.com');
    await userEvent.click(within(sign_in).getByRole('button', { name: 'Save changes' }));

    expect(await within(sign_in).findByText("That isn't your current password")).toBeInTheDocument();
    expect(within(sign_in).getByRole('alert')).toHaveTextContent('Please fix the highlighted fields');
  });

  it('shows the learning style answers and lets the student retake the quiz', async () => {
    learning_quiz_service.save_learning_profile.mockResolvedValue({ ...TEST_ACCOUNT, learning_profile: { learning_style: 'auditory' } });
    const { auth_value } = render_settings();
    const learning = get_section('Learning style and goals');

    expect(await within(learning).findByText('Seeing it')).toBeInTheDocument();
    await userEvent.click(within(learning).getByRole('button', { name: 'Retake the quiz' }));
    await userEvent.click(within(learning).getByRole('radio', { name: 'Hearing it' }));
    await userEvent.click(within(learning).getByRole('button', { name: 'Save my answers' }));

    expect(learning_quiz_service.save_learning_profile).toHaveBeenCalledWith(expect.objectContaining({ learning_style: 'auditory' }));
    expect(auth_value.set_account).toHaveBeenCalled();
    expect(await within(learning).findByRole('alert')).toHaveTextContent('Your focus timer now matches your new answers.');
  });

  it('invites a student who skipped the quiz to take it, and can cancel', async () => {
    render_settings(NEW_ACCOUNT);
    const learning = get_section('Learning style and goals');

    await userEvent.click(await within(learning).findByRole('button', { name: 'Take the quiz' }));
    await userEvent.click(within(learning).getByRole('button', { name: 'Cancel' }));

    expect(within(learning).getByText(/haven't taken the quiz yet/)).toBeInTheDocument();
  });

  it('deletes the account after the password is confirmed in a popup, then goes home', async () => {
    account_service.delete_account
      .mockRejectedValueOnce(Object.assign(new Error('Please fix'), { field_errors: { password: "That isn't your current password" } }))
      .mockResolvedValueOnce(null);
    const { auth_value, router } = render_settings();

    await userEvent.click(within(get_section('Delete account')).getByRole('button', { name: 'Delete my account' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your account?' });
    expect(dialog).toHaveTextContent(DELETED_ITEMS[0]);
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'wrong');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    expect(await within(dialog).findByText("That isn't your current password")).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Your password'));
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'correct horse');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    expect(account_service.delete_account).toHaveBeenLastCalledWith('correct horse');
    await waitFor(() => expect(auth_value.forget_account).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe('/');
  });

  it('keeps the account when the student changes their mind', async () => {
    render_settings();

    await userEvent.click(within(get_section('Delete account')).getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep my account' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(account_service.delete_account).not.toHaveBeenCalled();
  });
});
