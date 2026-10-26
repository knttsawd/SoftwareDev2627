import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import FormField from '../../src/components/FormField.jsx';

// FormField with its own state, so typing updates the value like a real form.
function ControlledField(field_props) {
  const [value, set_value] = useState('');
  return <FormField field_id="email" label="Email" value={value} on_change={set_value} {...field_props} />;
}

describe('FormField', () => {
  it('labels the input and passes typed text to on_change', async () => {
    render(<ControlledField />);

    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');

    expect(screen.getByLabelText('Email')).toHaveValue('sam@example.com');
  });

  it('links the hint and error to the input for screen readers', () => {
    render(<ControlledField hint="We never share it" error="Enter a valid email address" />);

    const email_input = screen.getByLabelText('Email');
    expect(email_input).toHaveAccessibleDescription('We never share it Enter a valid email address');
    expect(email_input).toHaveAttribute('aria-invalid', 'true');
  });

  it('is not marked invalid without an error', () => {
    render(<ControlledField />);

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });

  it('passes extra attributes to the input', () => {
    render(<ControlledField type="email" autoComplete="email" />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
  });
});
