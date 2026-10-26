import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STATUS } from '../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from './helpers/render_helpers.jsx';
import { NEW_ACCOUNT, TEST_ACCOUNT } from './helpers/test_data.js';

vi.mock('../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue({ work_block: null }) }));
vi.mock('../src/services/skill_service.js', () => ({ fetch_skills: vi.fn(), update_skill: vi.fn() }));
vi.mock('../src/services/schedule_service.js', async (import_original) => ({
  ...(await import_original()),
  fetch_events: vi.fn(),
  create_event: vi.fn(),
  update_event: vi.fn(),
  delete_event: vi.fn(),
}));

const { send_authed_request } = await import('../src/services/auth_service.js');
const skill_service = await import('../src/services/skill_service.js');
const schedule_service = await import('../src/services/schedule_service.js');
const { build_work_block_path, default: EventCard } = await import('../src/components/schedule/EventCard.jsx');
const { default: WeekCalendar } = await import('../src/components/schedule/WeekCalendar.jsx');
const { build_event_request, build_initial_event_values, default: EventDialog } = await import(
  '../src/components/schedule/EventDialog.jsx'
);
const { default: SubjectColorsPanel } = await import('../src/components/schedule/SubjectColorsPanel.jsx');
const { default: PlanWeekDialog } = await import('../src/components/schedule/PlanWeekDialog.jsx');
const { default: SchedulePage } = await import('../src/pages/dashboard/SchedulePage.jsx');

const MONDAY = new Date(2026, 9, 26);
const SKILLS = [{ id: 's1', name: 'Biology', color: '#15803D', resource_count: 1, weak_topic_count: 0, untested_topic_count: 0 }];
const EVENT = {
  id: 'e1',
  title: 'Biology essay',
  skill_id: 's1',
  skill_name: 'Biology',
  skill_color: '#15803D',
  details: 'Intro paragraph',
  starts_at: new Date(2026, 9, 27, 16).toISOString(),
  ends_at: new Date(2026, 9, 27, 17, 30).toISOString(),
};
const SIGNED_IN = create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT });

beforeEach(() => {
  vi.clearAllMocks();
  skill_service.fetch_skills.mockResolvedValue(SKILLS);
  schedule_service.fetch_events.mockResolvedValue([EVENT]);
});

describe('schedule service', () => {
  it('calls the event and work block endpoints', async () => {
    send_authed_request.mockResolvedValueOnce([]).mockResolvedValue({ work_block: { id: 'w1' } });
    const real_service = await vi.importActual('../src/services/schedule_service.js');

    await real_service.fetch_events(new Date('2026-10-26T00:00:00Z'), new Date('2026-11-02T00:00:00Z'));
    await real_service.fetch_event('e1');
    await real_service.create_event({ title: 'T' });
    await real_service.update_event('e1', { title: 'U' });
    await real_service.delete_event('e1');
    await real_service.start_work_block({ activity: 'quiz' });
    await expect(real_service.fetch_active_work_block()).resolves.toEqual({ id: 'w1' });
    await real_service.finish_work_block('w1', { completed_minutes: 5 });

    expect(send_authed_request.mock.calls).toEqual([
      ['/events?from=2026-10-26T00%3A00%3A00.000Z&to=2026-11-02T00%3A00%3A00.000Z'],
      ['/events/e1'],
      ['/events', { method: 'POST', body: { title: 'T' } }],
      ['/events/e1', { method: 'PATCH', body: { title: 'U' } }],
      ['/events/e1', { method: 'DELETE' }],
      ['/work-blocks', { method: 'POST', body: { activity: 'quiz' } }],
      ['/work-blocks/active'],
      ['/work-blocks/w1/finish', { method: 'POST', body: { completed_minutes: 5 } }],
    ]);
  });
});

describe('EventCard', () => {
  it('shows the time, title and subject, with work block, edit and remove buttons', async () => {
    const on_edit = vi.fn();
    const on_delete = vi.fn();
    render_in_router(<EventCard event={EVENT} on_edit={on_edit} on_delete={on_delete} />);

    expect(screen.getByRole('article', { name: 'Biology essay' })).toHaveTextContent('Biology');
    expect(screen.getByRole('link', { name: 'Start work block' })).toHaveAttribute('href', build_work_block_path('e1'));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Biology essay' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Biology essay' }));

    expect(on_edit).toHaveBeenCalledWith(EVENT);
    expect(on_delete).toHaveBeenCalledWith(EVENT);
    expect(build_work_block_path('e 1')).toBe('/dashboard/work-block?event=e%201');
  });
});

describe('WeekCalendar', () => {
  it('lists seven days, marks today, and puts events on their day', () => {
    render_in_router(
      <WeekCalendar week_start={MONDAY} events={[EVENT]} today={new Date(2026, 9, 27, 9)} on_edit_event={vi.fn()} on_delete_event={vi.fn()} />,
    );

    const days = screen.getAllByRole('listitem');
    expect(days).toHaveLength(7);
    expect(days[1]).toHaveAccessibleName(/today$/);
    expect(days[1]).toHaveTextContent('Biology essay');
    expect(days[0]).toHaveTextContent('Nothing planned');
  });
});

describe('EventDialog', () => {
  it('builds starting values for a new or existing event', () => {
    expect(build_initial_event_values(null, MONDAY)).toEqual({
      title: '',
      skill_id: '',
      date: '2026-10-26',
      start_time: '17:00',
      end_time: '18:00',
      details: '',
    });
    expect(build_initial_event_values(EVENT, MONDAY)).toMatchObject({ date: '2026-10-27', start_time: '16:00', end_time: '17:30' });
  });

  it('turns form values into an API request in local time', () => {
    expect(
      build_event_request({ title: 'T', skill_id: '', date: '2026-10-27', start_time: '16:00', end_time: '17:00', details: '' }),
    ).toEqual({
      title: 'T',
      skill_id: null,
      starts_at: new Date(2026, 9, 27, 16).toISOString(),
      ends_at: new Date(2026, 9, 27, 17).toISOString(),
      details: '',
    });
  });

  it('adds a new event', async () => {
    schedule_service.create_event.mockResolvedValue(EVENT);
    const on_saved = vi.fn();
    render(<EventDialog is_open event={null} skills={SKILLS} default_date={MONDAY} on_close={vi.fn()} on_saved={on_saved} />);

    await userEvent.type(screen.getByLabelText('What are you doing?'), 'Biology essay');
    await userEvent.selectOptions(screen.getByLabelText('Subject'), 'Biology');
    await userEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));

    expect(schedule_service.create_event).toHaveBeenCalledWith(expect.objectContaining({ title: 'Biology essay', skill_id: 's1' }));
    expect(on_saved).toHaveBeenCalledWith(EVENT);
  });

  it('saves the date, times and details as typed', async () => {
    schedule_service.create_event.mockResolvedValue(EVENT);
    render(<EventDialog is_open event={null} skills={SKILLS} default_date={MONDAY} on_close={vi.fn()} on_saved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('What are you doing?'), 'Lab report');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-28' } });
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '15:15' } });
    await userEvent.type(screen.getByLabelText('Details (optional)'), 'Write up results');
    await userEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));

    expect(schedule_service.create_event).toHaveBeenCalledWith(
      expect.objectContaining({
        starts_at: new Date(2026, 9, 28, 14).toISOString(),
        ends_at: new Date(2026, 9, 28, 15, 15).toISOString(),
        details: 'Write up results',
      }),
    );
  });

  it('edits an existing event and shows field errors', async () => {
    const time_error = Object.assign(new Error('Please fix the highlighted fields'), {
      field_errors: { ends_at: 'The end must be after the start' },
    });
    schedule_service.update_event.mockRejectedValue(time_error);
    render(<EventDialog is_open event={EVENT} skills={SKILLS} default_date={MONDAY} on_close={vi.fn()} on_saved={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(schedule_service.update_event).toHaveBeenCalledWith('e1', expect.objectContaining({ title: 'Biology essay' }));
    expect(await screen.findByText('The end must be after the start')).toBeInTheDocument();
  });
});

describe('SubjectColorsPanel', () => {
  it('saves a changed color', async () => {
    skill_service.update_skill.mockResolvedValue({ ...SKILLS[0], color: '#B91C1C' });
    const on_color_saved = vi.fn();
    render(<SubjectColorsPanel skills={SKILLS} on_color_saved={on_color_saved} />);

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Biology/), { target: { value: '#b91c1c' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(skill_service.update_skill).toHaveBeenCalledWith('s1', { color: '#b91c1c' });
    expect(on_color_saved).toHaveBeenCalledWith({ ...SKILLS[0], color: '#B91C1C' });
  });

  it('shows nothing without skills', () => {
    const { container } = render(<SubjectColorsPanel skills={[]} on_color_saved={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('PlanWeekDialog', () => {
  const PROPOSALS = [
    { title: 'Study Biology', skill_id: 's1', skill_name: 'Biology', starts_at: EVENT.starts_at, ends_at: EVENT.ends_at, details: 'Planned' },
    { title: 'Study Biology', skill_id: 's1', skill_name: 'Biology', starts_at: new Date(2026, 9, 28, 18).toISOString(), ends_at: new Date(2026, 9, 28, 18, 25).toISOString(), details: 'Planned' },
  ];

  it('adds the ticked sessions, without the display-only skill name', async () => {
    schedule_service.create_event.mockResolvedValue({});
    const on_added = vi.fn();
    render_in_router(<PlanWeekDialog is_open proposals={PROPOSALS} account={TEST_ACCOUNT} on_close={vi.fn()} on_added={on_added} />);

    await userEvent.click(screen.getAllByRole('checkbox')[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 session' }));

    expect(schedule_service.create_event).toHaveBeenCalledTimes(1);
    expect(schedule_service.create_event).toHaveBeenCalledWith({
      title: 'Study Biology',
      skill_id: 's1',
      starts_at: PROPOSALS[0].starts_at,
      ends_at: PROPOSALS[0].ends_at,
      details: 'Planned',
    });
    await waitFor(() => expect(on_added).toHaveBeenCalled());
  });

  it('suggests the learning style quiz to students who skipped it', () => {
    render_in_router(<PlanWeekDialog is_open proposals={PROPOSALS} account={NEW_ACCOUNT} on_close={vi.fn()} on_added={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Take the learning style quiz' })).toBeInTheDocument();
  });

  it('explains when there are no free slots', () => {
    render_in_router(<PlanWeekDialog is_open proposals={[]} account={TEST_ACCOUNT} on_close={vi.fn()} on_added={vi.fn()} />);

    expect(screen.getByText(/no free slots left/)).toBeInTheDocument();
  });
});

describe('SchedulePage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows this week, moves between weeks, and removes events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 9));
    schedule_service.delete_event.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render_in_router(<SchedulePage />, { auth_value: SIGNED_IN });

    expect(await screen.findByRole('article', { name: 'Biology essay' })).toBeInTheDocument();
    expect(schedule_service.fetch_events).toHaveBeenCalledWith(MONDAY, new Date(2026, 10, 2));

    await userEvent.click(screen.getByRole('button', { name: 'Remove Biology essay' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Biology essay' })).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(schedule_service.fetch_events).toHaveBeenLastCalledWith(new Date(2026, 10, 2), new Date(2026, 10, 9)));
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    await waitFor(() => expect(schedule_service.fetch_events).toHaveBeenLastCalledWith(MONDAY, new Date(2026, 10, 2)));
  });

  it('opens the add-event dialog and the week planner', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 9));
    render_in_router(<SchedulePage />, { auth_value: SIGNED_IN });
    await screen.findByRole('article', { name: 'Biology essay' });

    await userEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(screen.getByRole('dialog', { name: 'Add to your schedule' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await userEvent.click(screen.getByRole('button', { name: 'Plan my week' }));
    expect(screen.getByRole('dialog', { name: 'Plan my week' })).toBeInTheDocument();
  });

  it('reloads the week after planning sessions, saving a color or moving back a week', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 9));
    schedule_service.create_event.mockResolvedValue({});
    skill_service.update_skill.mockResolvedValue({ ...SKILLS[0], color: '#B91C1C' });
    render_in_router(<SchedulePage />, { auth_value: SIGNED_IN });
    await screen.findByRole('article', { name: 'Biology essay' });

    await userEvent.click(screen.getByRole('button', { name: 'Plan my week' }));
    await userEvent.click(screen.getByRole('button', { name: /^Add \d+ session/ }));
    await waitFor(() => expect(schedule_service.fetch_events).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Subject colors'));
    fireEvent.change(screen.getByLabelText(/Biology/, { selector: 'input[type="color"]' }), { target: { value: '#b91c1c' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(schedule_service.fetch_events).toHaveBeenCalledTimes(3));

    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(schedule_service.fetch_events).toHaveBeenLastCalledWith(new Date(2026, 9, 19), MONDAY));
  });
});
