import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { use_now } from '../src/hooks/use_now.js';
import { play_chime } from '../src/utils/chime.js';
import {
  add_days,
  combine_date_and_time,
  format_day_heading,
  format_time_range,
  format_week_range,
  get_events_on_day,
  get_week_days,
  is_same_day,
  start_of_week,
  to_date_input_value,
  to_time_input_value,
} from '../src/utils/dates.js';
import {
  get_plan_preferences,
  list_candidate_starts,
  overlaps_any,
  plan_study_week,
  rank_skills_for_planning,
} from '../src/utils/study_planner.js';
import { describe_phase_change, format_countdown, get_timer_state } from '../src/utils/work_block_timer.js';

// Monday Oct 26 2026, local time.
const MONDAY = new Date(2026, 9, 26);

describe('date helpers', () => {
  it('finds the Monday that starts the week', () => {
    expect(start_of_week(new Date(2026, 9, 29, 15, 30))).toEqual(MONDAY);
    expect(start_of_week(new Date(2026, 10, 1, 9))).toEqual(MONDAY);
    expect(start_of_week(MONDAY)).toEqual(MONDAY);
  });

  it('adds days and lists the week', () => {
    expect(add_days(MONDAY, 2)).toEqual(new Date(2026, 9, 28));
    expect(get_week_days(MONDAY).map((day) => day.getDate())).toEqual([26, 27, 28, 29, 30, 31, 1]);
  });

  it('compares days and converts to and from form values', () => {
    expect(is_same_day(new Date(2026, 9, 26, 1), new Date(2026, 9, 26, 23))).toBe(true);
    expect(to_date_input_value(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(to_time_input_value(new Date(2026, 0, 5, 9, 5))).toBe('09:05');
    expect(combine_date_and_time('2026-10-26', '18:30')).toEqual(new Date(2026, 9, 26, 18, 30));
  });

  it('formats headings and ranges in the local style', () => {
    expect(format_day_heading(MONDAY)).toBe(MONDAY.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
    expect(format_time_range(new Date(2026, 9, 26, 9), new Date(2026, 9, 26, 10))).toContain(' – ');
    expect(format_week_range(MONDAY)).toMatch(/2026$/);
  });

  it('picks the events that start on a day, earliest first', () => {
    const events = [
      { id: 'late', starts_at: new Date(2026, 9, 26, 18).toISOString() },
      { id: 'early', starts_at: new Date(2026, 9, 26, 8).toISOString() },
      { id: 'other day', starts_at: new Date(2026, 9, 27, 8).toISOString() },
    ];

    expect(get_events_on_day(events, MONDAY).map((event) => event.id)).toEqual(['early', 'late']);
  });
});

describe('study planner', () => {
  const SKILLS = [
    { id: 's1', name: 'Biology', weak_topic_count: 0, untested_topic_count: 1, resource_count: 2 },
    { id: 's2', name: 'Spanish', weak_topic_count: 2, untested_topic_count: 0, resource_count: 1 },
  ];

  it('uses the quiz answers, or defaults when skipped', () => {
    expect(get_plan_preferences({ weekly_hours: 'under_2', study_times: ['morning'] })).toEqual({
      weekly_hours: 'under_2',
      study_times: ['morning'],
    });
    expect(get_plan_preferences({})).toEqual({ weekly_hours: '2_to_5', study_times: ['evening'] });
  });

  it('ranks skills with weak topics first', () => {
    expect(rank_skills_for_planning(SKILLS).map((skill) => skill.name)).toEqual(['Spanish', 'Biology']);
  });

  it('detects clashes with busy times', () => {
    const busy = [{ starts_at: new Date(2026, 9, 26, 18).toISOString(), ends_at: new Date(2026, 9, 26, 19).toISOString() }];

    expect(overlaps_any(new Date(2026, 9, 26, 18, 30), new Date(2026, 9, 26, 19, 30), busy)).toBe(true);
    expect(overlaps_any(new Date(2026, 9, 26, 19), new Date(2026, 9, 26, 20), busy)).toBe(false);
  });

  it('spreads candidate times across the week, earliest preferred time first', () => {
    const candidates = list_candidate_starts(MONDAY, ['evening', 'morning']);

    expect(candidates).toHaveLength(14);
    expect(candidates[0]).toEqual(new Date(2026, 9, 26, 9));
    expect(candidates[1]).toEqual(new Date(2026, 9, 27, 9));
    expect(candidates[7]).toEqual(new Date(2026, 9, 26, 18));
  });

  it('plans enough sessions, skips the past and existing events, and shares out skills', () => {
    const proposals = plan_study_week({
      week_start: MONDAY,
      now: new Date(2026, 9, 26, 12),
      learning_profile: { weekly_hours: 'under_2', study_times: ['morning', 'evening'] },
      skills: SKILLS,
      events: [{ starts_at: new Date(2026, 9, 27, 9).toISOString(), ends_at: new Date(2026, 9, 27, 10).toISOString() }],
      session_minutes: 30,
    });

    expect(proposals).toHaveLength(3);
    expect(proposals.map((proposal) => new Date(proposal.starts_at))).toEqual([
      new Date(2026, 9, 28, 9),
      new Date(2026, 9, 29, 9),
      new Date(2026, 9, 30, 9),
    ]);
    expect(proposals.map((proposal) => proposal.title)).toEqual(['Study Spanish', 'Study Biology', 'Study Spanish']);
    expect(new Date(proposals[0].ends_at) - new Date(proposals[0].starts_at)).toBe(30 * 60 * 1000);
  });

  it('plans nothing without skills', () => {
    expect(plan_study_week({ week_start: MONDAY, now: MONDAY, learning_profile: {}, skills: [], events: [], session_minutes: 25 })).toEqual([]);
  });
});

describe('work block timer math', () => {
  const block = { started_at: new Date(2026, 9, 26, 10).toISOString(), planned_minutes: 25, break_minutes: 5 };

  it('counts down focus, then break, then finishes', () => {
    expect(get_timer_state({ ...block, now: new Date(2026, 9, 26, 10, 0, 1) })).toEqual({
      phase: 'focus',
      seconds_left: 1499,
      focused_minutes: 0,
    });
    expect(get_timer_state({ ...block, now: new Date(2026, 9, 26, 10, 26) })).toEqual({
      phase: 'break',
      seconds_left: 240,
      focused_minutes: 25,
    });
    expect(get_timer_state({ ...block, now: new Date(2026, 9, 26, 11) })).toEqual({ phase: 'done', seconds_left: 0, focused_minutes: 25 });
  });

  it('formats the countdown and describes phase changes', () => {
    expect(format_countdown(1499)).toBe('24:59');
    expect(format_countdown(5)).toBe('00:05');
    expect(describe_phase_change('break', 5)).toBe('Focus time is over. Take a 5-minute break.');
    expect(describe_phase_change('done', 5)).toMatch('Work block complete');
    expect(describe_phase_change('focus', 5)).toBe('Focus time has started.');
  });
});

describe('play_chime', () => {
  it('plays two notes', () => {
    const oscillators = [];
    const fake_context = {
      currentTime: 0,
      destination: {},
      createOscillator: () => {
        const oscillator = { frequency: {}, connect: vi.fn((node) => node), start: vi.fn(), stop: vi.fn() };
        oscillators.push(oscillator);
        return oscillator;
      },
      createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }),
    };

    play_chime(() => fake_context);

    expect(oscillators.map((oscillator) => oscillator.frequency.value)).toEqual([660, 880]);
    expect(oscillators[0].start).toHaveBeenCalled();
  });

  it('stays silent without Web Audio', () => {
    expect(() =>
      play_chime(() => {
        throw new Error('no audio');
      }),
    ).not.toThrow();
  });
});

describe('use_now', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks while active and stops when inactive', () => {
    vi.setSystemTime(new Date(2026, 9, 26, 10));
    const { result, rerender } = renderHook(({ is_active }) => use_now(1000, is_active), { initialProps: { is_active: true } });

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toEqual(new Date(2026, 9, 26, 10, 0, 3));

    rerender({ is_active: false });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toEqual(new Date(2026, 9, 26, 10, 0, 3));
  });
});
