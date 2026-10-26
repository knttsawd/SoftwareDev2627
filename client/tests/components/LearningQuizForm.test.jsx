import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LearningQuizForm from '../../src/components/LearningQuizForm.jsx';
import { build_initial_answers } from '../../src/services/learning_quiz_service.js';
import { SAMPLE_QUESTIONS } from '../helpers/test_data.js';

// Renders the form with blank answers and the given on_submit.
function render_quiz_form(on_submit) {
  render(
    <LearningQuizForm
      questions={SAMPLE_QUESTIONS}
      initial_answers={build_initial_answers(SAMPLE_QUESTIONS)}
      submit_label="Finish"
      on_submit={on_submit}
    />,
  );
}

describe('LearningQuizForm', () => {
  it('shows every question and submits the chosen answers', async () => {
    const on_submit = vi.fn().mockResolvedValue(undefined);
    render_quiz_form(on_submit);

    await userEvent.click(screen.getByRole('radio', { name: 'Seeing it' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Evening' }));
    await userEvent.type(screen.getByRole('textbox'), 'Pass biology');
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(on_submit).toHaveBeenCalledWith({
      learning_style: 'visual',
      study_times: ['evening'],
      goal_details: 'Pass biology',
    });
  });

  it('shows the server errors under the matching questions', async () => {
    const save_error = new Error('Please fix the highlighted fields');
    save_error.field_errors = { learning_style: 'Choose one option' };
    render_quiz_form(vi.fn().mockRejectedValue(save_error));

    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please fix the highlighted fields');
    expect(screen.getByRole('group', { name: 'How do you learn best?' })).toHaveAccessibleDescription(
      'Choose one option',
    );
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled();
  });
});
