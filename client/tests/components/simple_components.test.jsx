import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AlertMessage from '../../src/components/AlertMessage.jsx';
import AuthCard from '../../src/components/AuthCard.jsx';
import { get_button_classes, get_default_padding } from '../../src/components/button_styles.js';
import LoadingScreen from '../../src/components/LoadingScreen.jsx';
import Logo from '../../src/components/Logo.jsx';
import PageTitle, { format_page_title } from '../../src/components/PageTitle.jsx';
import StepIndicator from '../../src/components/StepIndicator.jsx';
import { render_in_router } from '../helpers/render_helpers.jsx';

describe('get_button_classes', () => {
  it('combines the base, the variant and any extra classes', () => {
    const primary_classes = get_button_classes('primary', 'mt-4');

    expect(primary_classes).toContain('bg-brand-600');
    expect(primary_classes).toContain('mt-4');
    expect(get_button_classes('secondary')).toContain('border');
  });

  it('defaults to the primary look', () => {
    expect(get_button_classes()).toBe(get_button_classes('primary'));
  });

  it('drops the default padding for any axis the extra classes set', () => {
    expect(get_default_padding('')).toBe('px-4 py-2.5');
    expect(get_default_padding('self-start px-2')).toBe('py-2.5');
    expect(get_default_padding('px-3 py-1.5 text-small')).toBe('');
    expect(get_button_classes('ghost', 'px-2').split(' ')).not.toContain('px-4');
  });
});

describe('Logo', () => {
  it('is a link named StudyApp', () => {
    render_in_router(<Logo to_path="/dashboard" />);

    expect(screen.getByRole('link', { name: 'StudyApp' })).toHaveAttribute('href', '/dashboard');
  });
});

describe('format_page_title and PageTitle', () => {
  it('adds the app name to the page name', () => {
    expect(format_page_title('Log in')).toBe('Log in · StudyApp');
  });

  it('sets the document title', () => {
    render(<PageTitle page_name="Sign up" />);

    expect(document.title).toBe('Sign up · StudyApp');
  });
});

describe('LoadingScreen', () => {
  it('announces its label as a status', () => {
    render(<LoadingScreen label="Loading the quiz" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading the quiz…');
  });

  it('says "Loading" by default', () => {
    render(<LoadingScreen />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});

describe('AlertMessage', () => {
  it('is announced as an alert with its message', () => {
    render(<AlertMessage tone="success">Saved</AlertMessage>);

    expect(screen.getByRole('alert')).toHaveTextContent('Saved');
  });
});

describe('StepIndicator', () => {
  it('shows the step in words and as a progress bar', () => {
    render(<StepIndicator current_step={1} step_count={2} step_name="Your details" />);

    expect(screen.getByText('Step 1 of 2: Your details')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Sign-up progress: step 1 of 2' })).toHaveAttribute('value', '1');
  });
});

describe('AuthCard', () => {
  it('shows the heading, intro and children', () => {
    render(
      <AuthCard title="Welcome back" intro="Log in to continue.">
        <p>form here</p>
      </AuthCard>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Log in to continue.')).toBeInTheDocument();
    expect(screen.getByText('form here')).toBeInTheDocument();
  });
});
