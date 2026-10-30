// Calendar date helpers. Everything works in the student's own time zone; the server
// stores ISO (UTC) date-times.

export const DAYS_PER_WEEK = 7;
const DAY_HEADING_FORMAT = { weekday: 'short', day: 'numeric', month: 'short' };
const TIME_FORMAT = { hour: 'numeric', minute: '2-digit' };
const SHORT_DATE_FORMAT = { month: 'short', day: 'numeric' };

// Midnight at the start of the Monday of date's week.
export function start_of_week(date) {
  const week_start = new Date(date);
  week_start.setHours(0, 0, 0, 0);
  week_start.setDate(week_start.getDate() - ((week_start.getDay() + 6) % DAYS_PER_WEEK));
  return week_start;
}

export function add_days(date, day_count) {
  const shifted_date = new Date(date);
  shifted_date.setDate(shifted_date.getDate() + day_count);
  return shifted_date;
}

// The seven days (Monday to Sunday) starting at week_start.
export function get_week_days(week_start) {
  return Array.from({ length: DAYS_PER_WEEK }, (unused, day_index) => add_days(week_start, day_index));
}

export function is_same_day(first_date, second_date) {
  return first_date.toDateString() === second_date.toDateString();
}

// Pads 7 -> "07".
function pad_two(number) {
  return String(number).padStart(2, '0');
}

// A date as an <input type="date"> value: "2026-10-26".
export function to_date_input_value(date) {
  return `${date.getFullYear()}-${pad_two(date.getMonth() + 1)}-${pad_two(date.getDate())}`;
}

// A time as an <input type="time"> value: "09:05".
export function to_time_input_value(date) {
  return `${pad_two(date.getHours())}:${pad_two(date.getMinutes())}`;
}

// Joins date and time input values into a Date in the student's time zone.
export function combine_date_and_time(date_value, time_value) {
  return new Date(`${date_value}T${time_value}`);
}

// "Mon, Oct 26" in the student's language.
export function format_day_heading(date) {
  return date.toLocaleDateString(undefined, DAY_HEADING_FORMAT);
}

// "9:00 AM – 10:30 AM"
export function format_time_range(starts_at, ends_at) {
  return `${new Date(starts_at).toLocaleTimeString(undefined, TIME_FORMAT)} – ${new Date(ends_at).toLocaleTimeString(undefined, TIME_FORMAT)}`;
}

// "Oct 26 – Nov 1, 2026"
export function format_week_range(week_start) {
  const week_end = add_days(week_start, DAYS_PER_WEEK - 1);
  return `${week_start.toLocaleDateString(undefined, SHORT_DATE_FORMAT)} – ${week_end.toLocaleDateString(undefined, { ...SHORT_DATE_FORMAT, year: 'numeric' })}`;
}

// The events that start on day, earliest first.
export function get_events_on_day(events, day) {
  return events
    .filter((event) => is_same_day(new Date(event.starts_at), day))
    .sort((first_event, second_event) => new Date(first_event.starts_at) - new Date(second_event.starts_at));
}
