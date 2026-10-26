import { Pencil, Timer, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { ROUTE_PATHS } from '../../config/constants.js';
import { format_time_range } from '../../utils/dates.js';
import { get_button_classes } from '../button_styles.js';

const NO_SUBJECT_COLOR = 'var(--color-border)';

// The work block page for an event.
export function build_work_block_path(event_id) {
  return `${ROUTE_PATHS.dashboard}/work-block?event=${encodeURIComponent(event_id)}`;
}

// One event on the calendar. The subject's color is a stripe down the side, and its name
// is written out too, so the subject never depends on color alone.
function EventCard({ event, on_edit, on_delete }) {
  return (
    <article
      aria-label={event.title}
      style={{ borderLeftColor: event.skill_color ?? NO_SUBJECT_COLOR }}
      className="flex w-full flex-col gap-2 rounded-lg border border-l-8 border-border bg-surface p-3 sm:w-72"
    >
      <div className="flex flex-col">
        <span className="text-caption text-ink-muted">{format_time_range(event.starts_at, event.ends_at)}</span>
        <h4 className="font-semibold leading-snug text-ink">{event.title}</h4>
        {event.skill_name && <span className="text-caption font-semibold text-ink-muted">{event.skill_name}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Link to={build_work_block_path(event.id)} className={get_button_classes('primary', 'px-2.5 py-1.5 text-small')}>
          <Timer aria-hidden="true" className="h-4 w-4" />
          Start work block
        </Link>
        <button type="button" onClick={() => on_edit(event)} className={get_button_classes('ghost', 'px-2 py-1.5')}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Edit {event.title}</span>
        </button>
        <button type="button" onClick={() => on_delete(event)} className={get_button_classes('ghost', 'px-2 py-1.5')}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Remove {event.title}</span>
        </button>
      </div>
    </article>
  );
}

export default EventCard;
