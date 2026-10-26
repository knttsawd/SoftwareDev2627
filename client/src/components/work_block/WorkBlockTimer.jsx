import { useEffect, useRef } from 'react';
import { use_now } from '../../hooks/use_now.js';
import { play_chime } from '../../utils/chime.js';
import { describe_phase_change, format_countdown, get_timer_state, WORK_BLOCK_PHASE } from '../../utils/work_block_timer.js';
import { get_button_classes } from '../button_styles.js';

const TICK_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const PHASE_LABELS = { focus: 'Focus time', break: 'Break', done: 'Done' };

// The countdown for a running work block. It redraws every second from started_at, chimes
// and announces each phase change, and calls on_focus_complete(timer_state) once when the
// focus period ends, so the block can be recorded. on_end_early(timer_state) runs for the
// "End block" button. The countdown text is a timer region, which screen readers don't
// read aloud every second; phase changes go to a separate status message instead.
function WorkBlockTimer({ work_block, on_focus_complete, on_end_early }) {
  const now = use_now(TICK_MS);
  const timer_state = get_timer_state({
    started_at: work_block.started_at,
    planned_minutes: work_block.planned_minutes,
    break_minutes: work_block.break_minutes,
    now,
  });
  const previous_phase = useRef(timer_state.phase);
  const phase_seconds =
    (timer_state.phase === WORK_BLOCK_PHASE.focus ? work_block.planned_minutes : work_block.break_minutes) * SECONDS_PER_MINUTE;

  useEffect(() => {
    if (timer_state.phase === previous_phase.current) return;
    previous_phase.current = timer_state.phase;
    play_chime();
  }, [timer_state.phase]);

  useEffect(() => {
    if (timer_state.phase !== WORK_BLOCK_PHASE.focus && !work_block.ended_at) on_focus_complete(timer_state);
    // Runs when the focus period is over; timer_state changes every second, so it is left out.
  }, [timer_state.phase, work_block.ended_at, on_focus_complete]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-6 text-center">
      <title>{`${format_countdown(timer_state.seconds_left)} ${PHASE_LABELS[timer_state.phase]} · StudyApp`}</title>
      <p className="text-small font-semibold uppercase tracking-wide text-brand-700">{PHASE_LABELS[timer_state.phase]}</p>
      <p role="timer" aria-label={`${PHASE_LABELS[timer_state.phase]} time left`} className="font-display text-display font-bold tabular-nums text-ink">
        {format_countdown(timer_state.seconds_left)}
      </p>
      {timer_state.phase !== WORK_BLOCK_PHASE.done && (
        <progress
          value={phase_seconds - timer_state.seconds_left}
          max={phase_seconds}
          aria-label={`${PHASE_LABELS[timer_state.phase]} progress`}
          className="h-2 w-full max-w-sm overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
        />
      )}
      <p role="status" className="sr-only">
        {timer_state.phase === WORK_BLOCK_PHASE.focus ? '' : describe_phase_change(timer_state.phase, work_block.break_minutes)}
      </p>
      {timer_state.phase === WORK_BLOCK_PHASE.focus && (
        <button type="button" onClick={() => on_end_early(timer_state)} className={get_button_classes('secondary')}>
          End block
        </button>
      )}
      {timer_state.phase === WORK_BLOCK_PHASE.done && (
        <p className="text-body text-ink">Nice work! You focused for {timer_state.focused_minutes} minutes.</p>
      )}
    </div>
  );
}

export default WorkBlockTimer;
