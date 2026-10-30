import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { use_escape_key } from '../../src/hooks/use_escape_key.js';

describe('use_escape_key', () => {
  it('calls on_escape for Escape while active, ignoring other keys', () => {
    const on_escape = vi.fn();
    renderHook(() => use_escape_key(true, on_escape));

    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(on_escape).toHaveBeenCalledTimes(1);
  });

  it('does nothing while inactive', () => {
    const on_escape = vi.fn();
    renderHook(() => use_escape_key(false, on_escape));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(on_escape).not.toHaveBeenCalled();
  });
});
