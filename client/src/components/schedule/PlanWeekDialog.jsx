import { useState } from 'react';
import { Link } from 'react-router';
import { ROUTE_PATHS } from '../../config/constants.js';
import { has_learning_profile } from '../../services/learning_quiz_service.js';
import { create_event } from '../../services/schedule_service.js';
import { format_day_heading, format_time_range } from '../../utils/dates.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import Dialog from '../Dialog.jsx';

// The suggested sessions as a checklist, all ticked to start with. Adding saves the ticked
// ones one by one, then on_added() reloads the calendar.
function PlanWeekForm({ proposals, account, on_added }) {
  const [chosen_indexes, set_chosen_indexes] = useState(() => new Set(proposals.map((proposal, index) => index)));
  const [save_error, set_save_error] = useState('');
  const [is_saving, set_is_saving] = useState(false);

  function toggle_proposal(proposal_index) {
    set_chosen_indexes((current_indexes) => {
      const next_indexes = new Set(current_indexes);
      if (next_indexes.has(proposal_index)) next_indexes.delete(proposal_index);
      else next_indexes.add(proposal_index);
      return next_indexes;
    });
  }

  async function handle_add() {
    set_is_saving(true);
    set_save_error('');
    try {
      for (const proposal_index of chosen_indexes) {
        // skill_name is only for showing the list; the API takes the other fields.
        const { skill_name, ...event_details } = proposals[proposal_index];
        await create_event(event_details);
      }
      on_added();
    } catch (create_error) {
      set_save_error(create_error.message);
      set_is_saving(false);
    }
  }

  if (proposals.length === 0) {
    return (
      <p className="text-body text-ink">
        There are no free slots left at your preferred study times this week. Try next week, or add sessions yourself.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-muted">
        Based on your study hours, preferred times and focus length. Subjects with weaker topics come first.
      </p>
      {!has_learning_profile(account) && (
        <p className="text-small text-ink">
          These use default answers.{' '}
          <Link to={ROUTE_PATHS.learning_quiz} className="font-semibold text-brand-700 underline">
            Take the learning style quiz
          </Link>{' '}
          for a plan that fits you.
        </p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Sessions to add</legend>
        {proposals.map((proposal, proposal_index) => (
          <label
            key={proposal.starts_at}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
          >
            <input
              type="checkbox"
              checked={chosen_indexes.has(proposal_index)}
              onChange={() => toggle_proposal(proposal_index)}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="flex flex-col">
              <span className="font-semibold text-ink">{proposal.title}</span>
              <span className="text-caption text-ink-muted">
                {format_day_heading(new Date(proposal.starts_at))}, {format_time_range(proposal.starts_at, proposal.ends_at)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {save_error && <AlertMessage>{save_error}</AlertMessage>}
      <button
        type="button"
        onClick={handle_add}
        disabled={is_saving || chosen_indexes.size === 0}
        className={get_button_classes('primary', 'self-start')}
      >
        {is_saving ? 'Adding…' : `Add ${chosen_indexes.size} session${chosen_indexes.size === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}

// Popup showing the planner's suggested sessions for the week.
function PlanWeekDialog({ is_open, proposals, account, on_close, on_added }) {
  return (
    <Dialog title="Plan my week" is_open={is_open} on_close={on_close}>
      <PlanWeekForm proposals={proposals} account={account} on_added={on_added} />
    </Dialog>
  );
}

export default PlanWeekDialog;
