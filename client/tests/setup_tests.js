// Runs before every client test file: adds DOM matchers like toBeInTheDocument,
// fills in browser features jsdom lacks, and resets state between tests.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement scrolling; React Router's ScrollRestoration calls it on navigation.
window.scrollTo = vi.fn();

// jsdom has <dialog> but not showModal/close. These stand-ins toggle the open attribute and
// fire "close" like a browser does, so Dialog can be tested.
HTMLDialogElement.prototype.showModal = function show_modal() {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close_dialog() {
  if (!this.hasAttribute('open')) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});
