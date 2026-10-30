import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { use_focus_on_navigation } from '../../src/hooks/use_focus_on_navigation.js';

let main_element;

beforeEach(() => {
  main_element = document.createElement('main');
  main_element.id = 'main-content';
  main_element.tabIndex = -1;
  document.body.append(main_element);
});

afterEach(() => {
  main_element.remove();
});

describe('use_focus_on_navigation', () => {
  it('leaves focus alone on the first page load', () => {
    renderHook(() => use_focus_on_navigation('/', 'main-content'));

    expect(document.activeElement).not.toBe(main_element);
  });

  it('focuses the target element after the path changes', () => {
    const { rerender } = renderHook(({ pathname }) => use_focus_on_navigation(pathname, 'main-content'), {
      initialProps: { pathname: '/' },
    });

    rerender({ pathname: '/login' });

    expect(document.activeElement).toBe(main_element);
  });
});
