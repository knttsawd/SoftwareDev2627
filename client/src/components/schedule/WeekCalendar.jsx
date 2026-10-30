import { format_day_heading, get_events_on_day, get_week_days, is_same_day } from '../../utils/dates.js';
import EventCard from './EventCard.jsx';

// The week as an agenda: one row per day (Monday to Sunday) with that day's events as
// cards side by side, in start-time order. On phones the rows stack and the cards fill the
// width. today is passed in so the "Today" tag is testable.
function WeekCalendar({ week_start, events, today, on_edit_event, on_delete_event }) {
  return (
    <ol aria-label="Week" className="flex flex-col gap-2">
      {get_week_days(week_start).map((day) => {
        const day_events = get_events_on_day(events, day);
        const is_today = is_same_day(day, today);
        return (
          <li
            key={day.toDateString()}
            aria-label={`${format_day_heading(day)}${is_today ? ', today' : ''}`}
            className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[9rem_1fr] ${is_today ? 'border-brand-600 bg-brand-50' : 'border-border bg-canvas'}`}
          >
            <h3 className="flex items-center gap-2 text-small font-semibold text-ink sm:flex-col sm:items-start">
              {format_day_heading(day)}
              {is_today && <span className="rounded-full bg-brand-600 px-2 text-caption text-white">Today</span>}
            </h3>
            {day_events.length === 0 ? (
              <p className="self-center text-caption text-ink-muted">Nothing planned</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {day_events.map((event) => (
                  <EventCard key={event.id} event={event} on_edit={on_edit_event} on_delete={on_delete_event} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default WeekCalendar;
