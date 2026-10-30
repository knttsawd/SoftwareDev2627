import { Link } from 'react-router';
import { ROUTE_PATHS, STUDY_TIME_CHART_DAYS } from '../../config/constants.js';
import { format_day_heading } from '../../utils/dates.js';
import { format_minutes, group_minutes_by_day } from '../../utils/progress.js';
import { get_button_classes } from '../button_styles.js';

// The chart's top line sits on a whole multiple of this many minutes.
const AXIS_STEP_MINUTES = 30;

// The value at the top of the chart: the busiest day, rounded up to a clean number.
export function get_axis_top(day_minutes) {
  const busiest = Math.max(0, ...day_minutes.map((day_total) => day_total.minutes));
  return Math.max(AXIS_STEP_MINUTES, Math.ceil(busiest / AXIS_STEP_MINUTES) * AXIS_STEP_MINUTES);
}

// "45 min of focus over the last 14 days, most on Sat 24 Oct (25 min)", read out in place of the bars.
export function describe_study_time(day_minutes) {
  const total = day_minutes.reduce((sum, day_total) => sum + day_total.minutes, 0);
  const busiest = day_minutes.reduce((best, day_total) => (day_total.minutes > best.minutes ? day_total : best));
  return `${format_minutes(total)} of focus over the last ${day_minutes.length} days, most on ${format_day_heading(busiest.day)} (${format_minutes(busiest.minutes)})`;
}

// Focus time from work blocks, one column per day for the last STUDY_TIME_CHART_DAYS days
// in the student's time zone. One series, so no legend: the heading says what it shows.
// Columns are capped at 24px with a rounded top; the busiest day carries its value, and
// hovering any column shows that day's. A table view gives every value as text. With no
// focus time at all there's nothing to draw, so it says how to add some instead.
function StudyTimeChart({ work_blocks, now }) {
  const day_minutes = group_minutes_by_day(work_blocks, now, STUDY_TIME_CHART_DAYS);
  const axis_top = get_axis_top(day_minutes);
  const busiest_minutes = Math.max(...day_minutes.map((day_total) => day_total.minutes));

  if (busiest_minutes === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-surface p-5">
        <p className="text-body text-ink-muted">
          No focus time in the last {STUDY_TIME_CHART_DAYS} days yet. Every work block you finish adds a column here.
        </p>
        <Link to={`${ROUTE_PATHS.dashboard}/work-block`} className={get_button_classes('secondary')}>
          Start a work block
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={describe_study_time(day_minutes)} className="flex gap-2">
        <div aria-hidden="true" className="flex h-44 flex-col justify-between pb-5 text-right text-caption text-ink-muted">
          <span>{format_minutes(axis_top)}</span>
          <span>{format_minutes(axis_top / 2)}</span>
          <span>0</span>
        </div>
        <div aria-hidden="true" className="flex h-44 flex-1 items-stretch gap-0.5">
          {day_minutes.map((day_total) => (
            <div key={day_total.day.toISOString()} className="group relative flex flex-1 flex-col items-center">
              <div className="relative flex w-full flex-1 items-end justify-center border-b border-border">
                {day_total.minutes > 0 && (
                  <div
                    style={{ height: `${(day_total.minutes / axis_top) * 100}%` }}
                    className="w-full max-w-6 rounded-t bg-brand-600"
                  />
                )}
                {day_total.minutes === busiest_minutes && busiest_minutes > 0 && (
                  <span
                    style={{ bottom: `${(day_total.minutes / axis_top) * 100}%` }}
                    className="absolute mb-1 text-caption font-semibold whitespace-nowrap text-ink"
                  >
                    {format_minutes(day_total.minutes)}
                  </span>
                )}
                <span className="pointer-events-none absolute bottom-full z-10 mb-2 hidden rounded-lg border border-border bg-surface px-2 py-1 text-caption whitespace-nowrap text-ink shadow group-hover:block">
                  {format_day_heading(day_total.day)}: {format_minutes(day_total.minutes)}
                </span>
              </div>
              <span className="pt-1 text-caption text-ink-muted">{day_total.day.getDate()}</span>
            </div>
          ))}
        </div>
      </div>
      <details className="text-small">
        <summary className="cursor-pointer font-semibold text-brand-700">Show as a table</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead>
            <tr className="border-b border-border text-ink-muted">
              <th scope="col" className="py-1 font-semibold">
                Day
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Focus time
              </th>
            </tr>
          </thead>
          <tbody>
            {day_minutes.map((day_total) => (
              <tr key={day_total.day.toISOString()} className="border-b border-border">
                <th scope="row" className="py-1 font-normal text-ink">
                  {format_day_heading(day_total.day)}
                </th>
                <td className="py-1 text-right text-ink">{format_minutes(day_total.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default StudyTimeChart;
