// Timer math for work blocks. The timer is worked out from when the block started rather
// than counted down in the browser, so it stays right after a page reload or when the tab
// sleeps. A block is a focus period of planned_minutes, then a break of break_minutes.

export const WORK_BLOCK_PHASE = { focus: 'focus', break: 'break', done: 'done' };
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

// Returns { phase, seconds_left, focused_minutes } for the moment now:
//   phase           "focus", "break" or "done"
//   seconds_left    whole seconds left in the current phase (0 when done)
//   focused_minutes whole minutes of focus so far, at most planned_minutes
export function get_timer_state({ started_at, planned_minutes, break_minutes, now }) {
  const elapsed_seconds = Math.max(0, Math.floor((now - new Date(started_at)) / MS_PER_SECOND));
  const focus_seconds = planned_minutes * SECONDS_PER_MINUTE;
  const break_seconds = break_minutes * SECONDS_PER_MINUTE;
  const focused_minutes = Math.min(Math.floor(elapsed_seconds / SECONDS_PER_MINUTE), planned_minutes);

  if (elapsed_seconds < focus_seconds) {
    return { phase: WORK_BLOCK_PHASE.focus, seconds_left: focus_seconds - elapsed_seconds, focused_minutes };
  }
  if (elapsed_seconds < focus_seconds + break_seconds) {
    return { phase: WORK_BLOCK_PHASE.break, seconds_left: focus_seconds + break_seconds - elapsed_seconds, focused_minutes };
  }
  return { phase: WORK_BLOCK_PHASE.done, seconds_left: 0, focused_minutes };
}

// 1499 -> "24:59"
export function format_countdown(total_seconds) {
  const minutes = Math.floor(total_seconds / SECONDS_PER_MINUTE);
  const seconds = total_seconds % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// What screen readers hear when the phase changes.
export function describe_phase_change(phase, break_minutes) {
  if (phase === WORK_BLOCK_PHASE.break) return `Focus time is over. Take a ${break_minutes}-minute break.`;
  if (phase === WORK_BLOCK_PHASE.done) return 'Your break is over. Work block complete.';
  return 'Focus time has started.';
}
