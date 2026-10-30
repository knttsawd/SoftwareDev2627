import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QuizQuestionField from '../../src/components/QuizQuestionField.jsx';
import { SAMPLE_QUESTIONS } from '../helpers/test_data.js';

const [SINGLE_QUESTION, MULTIPLE_QUESTION, TEXT_QUESTION] = SAMPLE_QUESTIONS;

describe('QuizQuestionField', () => {
  it('shows single choice as a labelled radio group and reports the chosen value', async () => {
    const on_change = vi.fn();
    render(<QuizQuestionField question={SINGLE_QUESTION} answer="" on_change={on_change} />);

    const radio_group = screen.getByRole('group', { name: 'How do you learn best?' });
    await userEvent.click(screen.getByRole('radio', { name: 'Hearing it' }));

    expect(radio_group).toBeInTheDocument();
    expect(on_change).toHaveBeenCalledWith('auditory');
  });

  it('marks the saved single choice as checked', () => {
    render(<QuizQuestionField question={SINGLE_QUESTION} answer="visual" on_change={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Seeing it' })).toBeChecked();
  });

  it('adds and removes checkbox choices', async () => {
    const on_change = vi.fn();
    render(<QuizQuestionField question={MULTIPLE_QUESTION} answer={['morning']} on_change={on_change} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Evening' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Morning' }));

    expect(on_change).toHaveBeenNthCalledWith(1, ['morning', 'evening']);
    expect(on_change).toHaveBeenNthCalledWith(2, []);
  });

  it('shows text questions as a labelled text box', async () => {
    const on_change = vi.fn();
    render(<QuizQuestionField question={TEXT_QUESTION} answer="" on_change={on_change} />);

    await userEvent.type(screen.getByLabelText('Anything specific you want to achieve?'), 'A');

    expect(on_change).toHaveBeenCalledWith('A');
  });

  it('links an error message to the question', () => {
    render(<QuizQuestionField question={SINGLE_QUESTION} answer="" error="Choose one option" on_change={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'How do you learn best?' })).toHaveAccessibleDescription(
      'Choose one option',
    );
  });
});
