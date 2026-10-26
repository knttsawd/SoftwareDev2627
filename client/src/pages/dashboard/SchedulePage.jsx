import { ChevronLeft, ChevronRight, Plus, Wand2 } from 'lucide-react';
import { useState } from 'react';
import AlertMessage from '../../components/AlertMessage.jsx';
import { get_button_classes } from '../../components/button_styles.js';
import PageTitle from '../../components/PageTitle.jsx';
import EventDialog from '../../components/schedule/EventDialog.jsx';
import PlanWeekDialog from '../../components/schedule/PlanWeekDialog.jsx';
import SubjectColorsPanel from '../../components/schedule/SubjectColorsPanel.jsx';
import WeekCalendar from '../../components/schedule/WeekCalendar.jsx';
import { use_auth } from '../../context/AuthContext.jsx';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { use_api_data } from '../../hooks/use_api_data.js';
import { delete_event, fetch_events } from '../../services/schedule_service.js';
import { fetch_skills } from '../../services/skill_service.js';
import { add_days, DAYS_PER_WEEK, format_week_range, start_of_week } from '../../utils/dates.js';
import { plan_study_week } from '../../utils/study_planner.js';

// The Schedule page: a week of study events, with buttons to move between weeks, add or
// edit events, plan the week from the learning style quiz, and change subject colors.
// Each event has a "Start work block" button.
function SchedulePage() {
  const { account } = use_auth();
  const [week_start, set_week_start] = useState(() => start_of_week(new Date()));
  const [dialog_event, set_dialog_event] = useState(null);
  const [is_event_dialog_open, set_is_event_dialog_open] = useState(false);
  const [plan_proposals, set_plan_proposals] = useState(null);
  const [action_error, set_action_error] = useState('');

  const week_end = add_days(week_start, DAYS_PER_WEEK);
  const events_state = use_api_data(() => fetch_events(week_start, week_end), [week_start.getTime()]);
  const skills_state = use_api_data(fetch_skills, []);
  const events = events_state.data ?? [];
  const skills = skills_state.data ?? [];

  function open_event_dialog(event = null) {
    set_dialog_event(event);
    set_is_event_dialog_open(true);
  }

  function handle_event_saved() {
    set_is_event_dialog_open(false);
    events_state.reload();
  }

  const confirm = use_confirm();

  async function handle_delete_event(event) {
    const message = `"${event.title}" is removed from your schedule.`;
    if (!(await confirm({ title: 'Remove this event?', message, confirm_label: 'Remove' }))) return;
    set_action_error('');
    try {
      await delete_event(event.id);
      events_state.set_data((current_events) => current_events.filter((item) => item.id !== event.id));
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  function open_week_plan() {
    set_plan_proposals(
      plan_study_week({
        week_start,
        now: new Date(),
        learning_profile: account.learning_profile,
        skills,
        events,
        session_minutes: account.work_minutes,
      }),
    );
  }

  function handle_plan_added() {
    set_plan_proposals(null);
    events_state.reload();
  }

  // A new color changes the skill and every event that uses it.
  function handle_color_saved(updated_skill) {
    skills_state.set_data((current_skills) => current_skills.map((skill) => (skill.id === updated_skill.id ? updated_skill : skill)));
    events_state.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle page_name="Schedule" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-1 font-bold text-ink">Schedule</h1>
          <p className="text-body text-ink-muted">Plan study sessions, then start a focused work block from any of them.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={open_week_plan}
            disabled={skills.length === 0}
            className={get_button_classes('secondary')}
          >
            <Wand2 aria-hidden="true" className="h-4 w-4" />
            Plan my week
          </button>
          <button type="button" onClick={() => open_event_dialog()} className={get_button_classes('primary')}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add event
          </button>
        </div>
      </div>

      <nav aria-label="Choose week" className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => set_week_start(add_days(week_start, -DAYS_PER_WEEK))} className={get_button_classes('ghost', 'px-2')}>
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          <span className="sr-only">Previous week</span>
        </button>
        <h2 aria-live="polite" className="min-w-56 text-center text-heading-3 font-semibold text-ink">
          {format_week_range(week_start)}
        </h2>
        <button type="button" onClick={() => set_week_start(add_days(week_start, DAYS_PER_WEEK))} className={get_button_classes('ghost', 'px-2')}>
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
          <span className="sr-only">Next week</span>
        </button>
        <button type="button" onClick={() => set_week_start(start_of_week(new Date()))} className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}>
          This week
        </button>
      </nav>

      {events_state.error && <AlertMessage>{events_state.error}</AlertMessage>}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      <WeekCalendar
        week_start={week_start}
        events={events}
        today={new Date()}
        on_edit_event={open_event_dialog}
        on_delete_event={handle_delete_event}
      />
      <SubjectColorsPanel skills={skills} on_color_saved={handle_color_saved} />

      <EventDialog
        is_open={is_event_dialog_open}
        event={dialog_event}
        skills={skills}
        default_date={week_start > new Date() ? week_start : new Date()}
        on_close={() => set_is_event_dialog_open(false)}
        on_saved={handle_event_saved}
      />
      <PlanWeekDialog
        is_open={plan_proposals !== null}
        proposals={plan_proposals ?? []}
        account={account}
        on_close={() => set_plan_proposals(null)}
        on_added={handle_plan_added}
      />
    </div>
  );
}

export default SchedulePage;
