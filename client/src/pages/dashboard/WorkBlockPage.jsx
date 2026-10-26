import { ClipboardList } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import AlertMessage from '../../components/AlertMessage.jsx';
import { get_button_classes } from '../../components/button_styles.js';
import PageTitle from '../../components/PageTitle.jsx';
import QuizWorkspace from '../../components/quiz/QuizWorkspace.jsx';
import WorkBlockTimer from '../../components/work_block/WorkBlockTimer.jsx';
import { ROUTE_PATHS } from '../../config/constants.js';
import { get_feedback_timing } from '../../config/mastery.js';
import { use_auth } from '../../context/AuthContext.jsx';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { use_api_data } from '../../hooks/use_api_data.js';
import {
  fetch_active_work_block,
  fetch_event,
  finish_work_block,
  start_work_block,
} from '../../services/schedule_service.js';
import { format_time_range } from '../../utils/dates.js';

export const ACTIVITY_OPTIONS = [
  { value: 'assignment', label: 'Work on the scheduled assignment' },
  { value: 'quiz', label: 'Take a quiz' },
];

// What the student is working on during the block: the event's assignment (title and
// details), or a quiz on the event's subject.
function ActivityPanel({ activity, event, skill_id, feedback_timing }) {
  if (activity === 'quiz') {
    return <QuizWorkspace initial_skill_id={skill_id ?? undefined} feedback_timing={feedback_timing} />;
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-5">
      <ClipboardList aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" />
      <div className="flex flex-col gap-1">
        <h3 className="text-heading-3 font-semibold text-ink">{event?.title ?? 'Your own task'}</h3>
        <p className="text-body text-ink-muted">
          {event?.details || 'Put your phone away, close extra tabs, and work on this until the timer ends.'}
        </p>
      </div>
    </div>
  );
}

// The Work block page: a focus timer (work, then a break) with a dropdown to spend the block
// on a quiz or on the scheduled assignment. ?event=<id> links the block to a schedule
// event. An unfinished block is picked up again after a reload.
function WorkBlockPage() {
  const { account } = use_auth();
  const [search_params] = useSearchParams();
  const event_id = search_params.get('event');
  const active_block_state = use_api_data(fetch_active_work_block, [], { live: false });
  const event_state = use_api_data(() => (event_id ? fetch_event(event_id) : Promise.resolve(null)), [event_id], {
    live: false,
  });
  const [work_block, set_work_block] = useState(null);
  const [activity, set_activity] = useState(event_id ? 'assignment' : 'quiz');
  const [ended_early_minutes, set_ended_early_minutes] = useState(null);
  const [action_error, set_action_error] = useState('');

  const event = event_state.data ?? null;
  const block_skill_id = work_block?.skill_id ?? event?.skill_id ?? null;

  useEffect(() => {
    if (active_block_state.data) {
      set_work_block(active_block_state.data);
      set_activity(active_block_state.data.activity);
    }
  }, [active_block_state.data]);

  async function handle_start() {
    set_action_error('');
    set_ended_early_minutes(null);
    try {
      set_work_block(await start_work_block({ activity, event_id: event?.id }));
    } catch (start_error) {
      set_action_error(start_error.message);
    }
  }

  // Records the block once the focus period is over; the break then counts down.
  const handle_focus_complete = useCallback(
    async (timer_state) => {
      try {
        set_work_block(await finish_work_block(work_block.id, { completed_minutes: timer_state.focused_minutes, activity }));
      } catch (finish_error) {
        set_action_error(finish_error.message);
      }
    },
    [work_block?.id, activity],
  );

  const confirm = use_confirm();

  async function handle_end_early(timer_state) {
    const is_ending = await confirm({
      title: 'End this work block?',
      message: 'The time you have focused so far is still saved.',
      confirm_label: 'End now',
      cancel_label: 'Keep going',
      tone: 'primary',
    });
    if (!is_ending) return;
    try {
      await finish_work_block(work_block.id, { completed_minutes: timer_state.focused_minutes, activity });
      set_ended_early_minutes(timer_state.focused_minutes);
      set_work_block(null);
    } catch (finish_error) {
      set_action_error(finish_error.message);
    }
  }

  const is_running = work_block !== null;

  return (
    <div className="flex flex-col gap-6">
      {!is_running && <PageTitle page_name="Work block" />}
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 font-bold text-ink">Work block</h1>
        <p className="text-body text-ink-muted">
          {account.work_minutes} minutes of focus, then a {account.break_minutes}-minute break.
        </p>
      </div>

      {event && (
        <p className="text-small text-ink">
          For <span className="font-semibold">{event.title}</span>
          {event.skill_name && ` (${event.skill_name})`}, {format_time_range(event.starts_at, event.ends_at)}
        </p>
      )}
      {event_state.error && <AlertMessage>{event_state.error}</AlertMessage>}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {ended_early_minutes !== null && (
        <AlertMessage tone="success">Block ended. You focused for {ended_early_minutes} minutes.</AlertMessage>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="work-block-activity" className="text-small font-semibold text-ink">
          During this block I will
        </label>
        <select
          id="work-block-activity"
          value={activity}
          onChange={(change_event) => set_activity(change_event.target.value)}
          className="max-w-sm rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
        >
          {ACTIVITY_OPTIONS.map((activity_option) => (
            <option key={activity_option.value} value={activity_option.value}>
              {activity_option.label}
            </option>
          ))}
        </select>
      </div>

      {is_running ? (
        <>
          <WorkBlockTimer
            key={work_block.id}
            work_block={work_block}
            on_focus_complete={handle_focus_complete}
            on_end_early={handle_end_early}
          />
          {work_block.ended_at && (
            <button type="button" onClick={handle_start} className={get_button_classes('primary', 'self-start')}>
              Start another block
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handle_start}
            disabled={active_block_state.is_loading}
            className={get_button_classes('primary')}
          >
            Start work block
          </button>
          <Link to={`${ROUTE_PATHS.dashboard}/schedule`} className={get_button_classes('secondary')}>
            Back to schedule
          </Link>
        </div>
      )}

      {is_running && (
        <ActivityPanel activity={activity} event={event} skill_id={block_skill_id} feedback_timing={get_feedback_timing(account)} />
      )}
    </div>
  );
}

export default WorkBlockPage;
