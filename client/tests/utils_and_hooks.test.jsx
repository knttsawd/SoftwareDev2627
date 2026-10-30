import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { use_api_data } from '../src/hooks/use_api_data.js';
import { format_character_count, format_date, get_choice_letter } from '../src/utils/format.js';

describe('format helpers', () => {
  it('formats dates in the local style', () => {
    expect(format_date('2026-10-24T12:00:00.000Z')).toBe(
      new Date('2026-10-24T12:00:00.000Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    );
  });

  it('formats character counts compactly with the right plural', () => {
    expect(format_character_count(1)).toBe('1 character');
    expect(format_character_count(631)).toBe('631 characters');
    expect(format_character_count(89_800)).toBe('89.8K characters');
  });

  it('letters multiple-choice options', () => {
    expect([0, 1, 2, 3].map(get_choice_letter)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('use_api_data', () => {
  it('loads data and reports loading', async () => {
    const { result } = renderHook(() => use_api_data(() => Promise.resolve(['a']), []));

    expect(result.current.is_loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(['a']));
    expect(result.current.is_loading).toBe(false);
  });

  it('reports errors', async () => {
    const { result } = renderHook(() => use_api_data(() => Promise.reject(new Error('Server down')), []));

    await waitFor(() => expect(result.current.error).toBe('Server down'));
  });

  it('reloads on request and when dependencies change', async () => {
    const load_data = vi.fn().mockResolvedValue('data');
    const { result, rerender } = renderHook(({ skill_id }) => use_api_data(() => load_data(skill_id), [skill_id]), {
      initialProps: { skill_id: 's1' },
    });
    await waitFor(() => expect(result.current.data).toBe('data'));

    act(() => result.current.reload());
    rerender({ skill_id: 's2' });

    await waitFor(() => expect(load_data).toHaveBeenCalledTimes(3));
    expect(load_data).toHaveBeenLastCalledWith('s2');
  });

  it('lets the caller update the data locally', async () => {
    const { result } = renderHook(() => use_api_data(() => Promise.resolve([1]), []));
    await waitFor(() => expect(result.current.data).toEqual([1]));

    act(() => result.current.set_data((current_data) => [...current_data, 2]));
    expect(result.current.data).toEqual([1, 2]);

    act(() => result.current.set_data([]));
    expect(result.current.data).toEqual([]);
  });

  it('ignores an answer that arrives after the dependencies changed', async () => {
    let resolve_old_request;
    const load_data = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolve_old_request = resolve)))
      .mockResolvedValueOnce('new data');
    const { result, rerender } = renderHook(({ skill_id }) => use_api_data(() => load_data(skill_id), [skill_id]), {
      initialProps: { skill_id: 's1' },
    });

    rerender({ skill_id: 's2' });
    await waitFor(() => expect(result.current.data).toBe('new data'));
    await act(async () => resolve_old_request('old data'));

    expect(result.current.data).toBe('new data');
  });
});
