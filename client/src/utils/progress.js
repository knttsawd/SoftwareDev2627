import { MINUTES_PER_HOUR } from '../config/constants.js';
import { add_days, is_same_day } from './dates.js';

// Helpers for the Progress page. Progress is shown as bars and comparisons with an earlier
// period only: no streaks, badges or levels.

// "1 h 25 min", "45 min" or "0 min".
export function format_minutes(total_minutes) {
  const hours = Math.floor(total_minutes / MINUTES_PER_HOUR);
  const minutes = total_minutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

// "points" for score changes, written as "8 points".
export function format_points(points) {
  return `${points} ${points === 1 ? 'point' : 'points'}`;
}

// How a metric moved compared with the period before, in words, with a direction for its
// icon: { direction: "up" | "down" | "same" | null, text }. format_amount writes the size
// of the change (format_points or format_minutes).
export function describe_change(change, period_days, format_amount = format_points) {
  if (change === null) return { direction: null, text: 'Not enough yet to compare with an earlier period' };
  if (change === 0) return { direction: 'same', text: `The same as the ${period_days} days before` };
  const direction = change > 0 ? 'up' : 'down';
  return { direction, text: `${change > 0 ? 'Up' : 'Down'} ${format_amount(Math.abs(change))} on the ${period_days} days before` };
}

// Minutes of focus per day for the last day_count days up to today, in the student's own
// time zone, oldest first: [{ day (local midnight), minutes }].
export function group_minutes_by_day(work_blocks, now, day_count) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: day_count }, (_, day_index) => {
    const day = add_days(today, day_index - day_count + 1);
    const minutes = work_blocks
      .filter((work_block) => is_same_day(new Date(work_block.started_at), day))
      .reduce((total, work_block) => total + work_block.completed_minutes, 0);
    return { day, minutes };
  });
}
