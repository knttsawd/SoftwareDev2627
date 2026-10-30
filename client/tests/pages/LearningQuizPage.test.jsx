import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STATUS } from '../../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from '../helpers/render_helpers.jsx';
import { NEW_ACCOUNT, SAMPLE_QUESTIONS, TEST_ACCOUNT } from '../helpers/test_data.js';

vi.mock('../../src/services/learning_quiz_service.js', async (import_original) => ({
  ...(await import_original()),
  fetch_learning_quiz: vi.fn(),
  save_learning_profile: vi.fn(),
}));

const { fetch_learning_quiz, save_learning_profile } = await import('../../src/services/learning_quiz_service.js');
const { default: LearningQuizPage } = await import('../../src/pages/LearningQuizPage.jsx');

// Renders the page for a signed-in student who has not taken the quiz yet.
function render_quiz_page() {
  const auth_value = create_auth_value({ status: AUTH_STATUS.signed_in, account: NEW_ACCOUNT });
  return { auth_value, ...render_in_router(<LearningQuizPage />, { auth_value, initial_path: '/signup/learning-style' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LearningQuizPage', () => {
  it('greets the student, shows step 2 and loads the questions', async () => {
    fetch_learning_quiz.mockResolvedValue(SAMPLE_QUESTIONS);
    render_quiz_page();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How do you like to learn, Sam?');
    expect(screen.getByText('Step 2 of 2: How you learn')).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'How do you learn best?' })).toBeInTheDocument();
  });

  it('saves the answers, updates the account and opens the dashboard', async () => {
    fetch_learning_quiz.mockResolvedValue(SAMPLE_QUESTIONS);
    save_learning_profile.mockResolvedValue(TEST_ACCOUNT);
    const { auth_value, router } = render_quiz_page();

    await userEvent.click(await screen.findByRole('radio', { name: 'Seeing it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish and go to my dashboard' }));

    expect(save_learning_profile).toHaveBeenCalledWith(expect.objectContaining({ learning_style: 'visual' }));
    expect(auth_value.set_account).toHaveBeenCalledWith(TEST_ACCOUNT);
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
  });

  it('lets the student skip straight to the dashboard without saving', async () => {
    fetch_learning_quiz.mockResolvedValue(SAMPLE_QUESTIONS);
    const { router } = render_quiz_page();

    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(save_learning_profile).not.toHaveBeenCalled();
  });

  it('shows an error if the questions cannot be loaded', async () => {
    fetch_learning_quiz.mockRejectedValue(new Error('Request failed with status 500'));
    render_quiz_page();

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed with status 500');
  });
});
