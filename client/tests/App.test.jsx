import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App.jsx';

describe('App', () => {
  it('starts a logged-out visitor on the homepage', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Study smarter');
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });
});
