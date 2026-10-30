import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { use_page_transition } from '../../src/hooks/use_page_transition.js';

const TRANSITION_MS = 300;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('use_page_transition', () => {
  it('is false on the first page load', () => {
    const { result } = renderHook(() => use_page_transition('/', TRANSITION_MS));

    expect(result.current).toBe(false);
  });

  it('is true for the set time after the path changes', () => {
    const { result, rerender } = renderHook(({ pathname }) => use_page_transition(pathname, TRANSITION_MS), {
      initialProps: { pathname: '/' },
    });

    rerender({ pathname: '/login' });
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(TRANSITION_MS));
    expect(result.current).toBe(false);
  });

  it('never shows when the time is 0', () => {
    const { result, rerender } = renderHook(({ pathname }) => use_page_transition(pathname, 0), {
      initialProps: { pathname: '/' },
    });

    rerender({ pathname: '/login' });

    expect(result.current).toBe(false);
  });
});
