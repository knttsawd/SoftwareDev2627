import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/chime.js', () => ({ play_chime: vi.fn() }));

const { play_chime } = await import('../src/utils/chime.js');
const widget_utils = await import('../src/utils/widgets.js');
const { default: WidgetBlock } = await import('../src/components/widgets/WidgetBlocks.jsx');

const NOW = new Date('2026-10-26T10:00:00Z');
const REGULAR = { size: 'regular', orientation: null };
const COMPACT = { size: 'compact', orientation: null };
const LARGE = { size: 'large', orientation: null };
const in_seconds = (seconds) => new Date(NOW.getTime() + seconds * 1000).toISOString();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('countdown units', () => {
  it('shows units that fit the time left', () => {
    const units_for = (seconds) => widget_utils.pick_countdown_units(widget_utils.split_countdown(in_seconds(seconds), NOW)).map((unit) => unit.label);
    expect(units_for(3 * 86_400 + 3600)).toEqual(['days', 'hour', 'minutes']);
    expect(units_for(2 * 3600 + 61)).toEqual(['hours', 'minute', 'second']);
    expect(units_for(30 * 60)).toEqual(['minutes', 'seconds']);
  });

  it('says how long is left with the two units that matter', () => {
    expect(widget_utils.describe_countdown(in_seconds(30 * 60), NOW).text).toBe('30 minutes left');
    expect(widget_utils.describe_countdown(in_seconds(25 * 60 + 10), NOW).text).toBe('25 minutes, 10 seconds left');
    expect(widget_utils.describe_countdown(in_seconds(40), NOW).text).toBe('40 seconds left');
    expect(widget_utils.describe_countdown(in_seconds(3 * 86_400 + 4 * 3600 + 120), NOW).text).toBe('3 days, 4 hours left');
    expect(widget_utils.describe_countdown(in_seconds(-1), NOW)).toEqual({ is_past: true, text: "It's here" });
  });

  it('writes clocks and when a countdown ends', () => {
    expect(widget_utils.format_clock(1500)).toBe('25:00');
    expect(widget_utils.format_clock(3909)).toBe('1:05:09');
    expect(widget_utils.format_clock(-3)).toBe('0:00');
    const local_now = new Date(2026, 9, 26, 9, 0);
    expect(widget_utils.describe_countdown_end(new Date(2026, 9, 26, 15, 30).toISOString(), local_now)).toMatch(/^Today at 3:30/);
    expect(widget_utils.describe_countdown_end(new Date(2026, 9, 27, 9, 0).toISOString(), local_now)).toMatch(/^Tomorrow at 9:00/);
    expect(widget_utils.describe_countdown_end(new Date(2026, 10, 14, 9, 0).toISOString(), local_now)).toMatch(/14/);
  });

  it('counts down 30 minutes in minutes and seconds, never days', () => {
    vi.useFakeTimers({ now: NOW });
    render(<WidgetBlock block={{ type: 'countdown', label: 'Break', target: in_seconds(30 * 60) }} block_index={0} block_id="b" shape={REGULAR} />);
    expect(screen.getByText('minutes')).toBeInTheDocument();
    expect(screen.getByText('seconds')).toBeInTheDocument();
    expect(screen.queryByText('days')).not.toBeInTheDocument();
    expect(screen.getByText(/Today at/)).toBeInTheDocument();
    // Within a day it ticks every second.
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('29 minutes, 55 seconds left')).toBeInTheDocument();
    cleanup();
    render(<WidgetBlock block={{ type: 'countdown', label: 'Break', target: in_seconds(30 * 60) }} block_index={0} block_id="b" shape={COMPACT} />);
    expect(screen.getByText('29:55')).toBeInTheDocument();
  });
});

describe('timer blocks', () => {
  const TIMER = { type: 'timer', label: 'Focus', seconds: 1800 };

  it('keeps its state as when it ends, or what was left when paused', () => {
    expect(widget_utils.read_timer({}, 0, 1800, NOW)).toEqual({ status: 'ready', remaining_ms: 1_800_000 });
    const running = widget_utils.save_timer({ other: 1 }, 0, { ends_at: in_seconds(600) });
    expect(running).toEqual({ other: 1, timers: { 0: { ends_at: in_seconds(600) } } });
    expect(widget_utils.read_timer(running, 0, 1800, NOW)).toEqual({ status: 'running', remaining_ms: 600_000 });
    expect(widget_utils.read_timer(running, 0, 1800, new Date(NOW.getTime() + 601_000)).status).toBe('done');
    expect(widget_utils.read_timer({ timers: { 0: { remaining_ms: 5000 } } }, 0, 1800, NOW)).toEqual({ status: 'paused', remaining_ms: 5000 });
    expect(widget_utils.save_timer(running, 0, null)).toEqual({ other: 1, timers: {} });
  });

  it('starts, pauses, resumes and resets through on_state_change', async () => {
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
    const on_state_change = vi.fn();
    const show = (state) => {
      cleanup();
      render(<WidgetBlock block={TIMER} block_index={0} block_id="t" state={state} shape={LARGE} on_state_change={on_state_change} />);
    };
    show({});
    expect(screen.getByText('30:00')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start Focus' }));
    const started = on_state_change.mock.calls.at(-1)[0];
    expect(new Date(started.timers[0].ends_at).getTime() - Date.now()).toBeGreaterThan(1_799_000);

    show(started);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('29:00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause Focus' }));
    const paused = on_state_change.mock.calls.at(-1)[0];
    expect(paused.timers[0].remaining_ms).toBeLessThanOrEqual(1_740_000);

    show(paused);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume Focus' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset Focus' }));
    expect(on_state_change.mock.calls.at(-1)[0]).toEqual({ timers: {} });
  });

  it("chimes and says time's up when it ends while showing", () => {
    vi.useFakeTimers({ now: NOW });
    render(<WidgetBlock block={TIMER} block_index={0} block_id="t" state={{ timers: { 0: { ends_at: in_seconds(2) } } }} shape={COMPACT} on_state_change={vi.fn()} />);
    expect(screen.getByText('0:02')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(play_chime).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Focus: time's up")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Focus' })).toBeInTheDocument();
  });
});
