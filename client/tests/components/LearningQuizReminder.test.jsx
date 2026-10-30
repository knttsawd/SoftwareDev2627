import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LearningQuizReminder from '../../src/components/LearningQuizReminder.jsx';
import { AUTH_STATUS } from '../../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from '../helpers/render_helpers.jsx';
import { NEW_ACCOUNT, TEST_ACCOUNT } from '../helpers/test_data.js';

describe('LearningQuizReminder', () => {
  it('links students who skipped the quiz to it', () => {
    render_in_router(<LearningQuizReminder />, {
      auth_value: create_auth_value({ status: AUTH_STATUS.signed_in, account: NEW_ACCOUNT }),
    });

    expect(screen.getByRole('link', { name: 'Take the quiz' })).toHaveAttribute('href', '/signup/learning-style');
  });

  it('shows nothing once the quiz is taken', () => {
    render_in_router(<LearningQuizReminder />, {
      auth_value: create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT }),
    });

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
