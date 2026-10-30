import { Link } from 'react-router';
import { ROUTE_PATHS } from '../../config/constants.js';
import { RESOURCE_TYPE_DETAILS } from '../../config/resource_types.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { fetch_reading_list } from '../../services/learning_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';

// "Up to section 3 of 12", or "1 section" for a resource that fits in one.
export function describe_reading_progress(reading_item) {
  if (reading_item.section_count === 1) return '1 section';
  return `Up to section ${reading_item.position + 1} of ${reading_item.section_count}`;
}

// The Reading tab: the skill's resources, each with how far through it the student is and
// a button to read it with a guide (on_open(resource_id)).
function ReadingList({ skill, on_open }) {
  const reading_state = use_api_data(() => fetch_reading_list(skill.id), [skill.id]);
  const reading_items = (reading_state.data ?? []).filter((reading_item) => reading_item.section_count > 0);

  if (reading_state.error) return <AlertMessage>{reading_state.error}</AlertMessage>;
  if (!reading_state.data) return <p className="text-small text-ink-muted">Loading your resources…</p>;

  return (
    <section aria-labelledby="reading-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="reading-heading" className="text-heading-2 font-bold text-ink">
          Read with a guide
        </h2>
        <p className="text-body text-ink-muted">
          Read one of your resources a section at a time. Each section comes with a plain-language guide and something
          to think about, and you can ask about any part you're stuck on.
        </p>
      </div>
      {reading_items.length === 0 ? (
        <p className="text-body text-ink">
          No resources to read in {skill.name} yet. Add one on the{' '}
          <Link to={`${ROUTE_PATHS.dashboard}/skill-map?skill=${skill.id}`} className="font-semibold text-brand-700 underline">
            skill map
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reading_items.map((reading_item) => {
            const { label, icon: TypeIcon } = RESOURCE_TYPE_DETAILS[reading_item.resource_type];
            const has_started = reading_item.position > 0;
            return (
              <li key={reading_item.resource_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                <TypeIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-700" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-ink">{reading_item.title}</span>
                  <span className="text-caption text-ink-muted">
                    {label} · {describe_reading_progress(reading_item)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => on_open(reading_item.resource_id)}
                  aria-label={`${has_started ? 'Continue reading' : 'Start reading'} ${reading_item.title}`}
                  className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}
                >
                  {has_started ? 'Continue reading' : 'Start reading'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default ReadingList;
