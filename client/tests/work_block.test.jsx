import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STATUS } from '../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from './helpers/render_helpers.jsx';
import { TEST_ACCOUNT } from './helpers/test_data.js';

vi.mock('../src/utils/chime.js', () => ({ play_chime: vi.fn() }));
vi.mock('../src/services/schedule_service.js', () => ({
  fetch_active_work_block: vi.fn(),
  fetch_event: vi.fn(),
  start_work_block: vi.fn(),
  finish_work_block: vi.fn(),
}));
vi.mock('../src/services/skill_service.js', () => ({ fetch_skills: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/services/topic_service.js', () => ({ fetch_topic_map: vi.fn().mockResolvedValue({ topics: [] }) }));

const { play_chime } = await import('../src/utils/chime.js');
const schedule_service = await import('../src/services/schedule_service.js');
const { default: WorkBlockTimer } = await import('../src/components/work_block/WorkBlockTimer.jsx');
const { ACTIVITY_OPTIONS, default: WorkBlockPage } = await import('../src/pages/dashboard/WorkBlockPage.jsx');

const STARTED_AT = new Date(2026, 9, 26, 10);
const WORK_BLOCK = {
  id: 'w1',
  event_id: 'e1',
  skill_id: 's1',
  activity: 'assignment',
  planned_minutes: 25,
  break_minutes: 5,
  started_at: STARTED_AT.toISOString(),
  ended_at: null,
};
const EVENT = {
  id: 'e1',
  title: 'Biology essay',
  details: 'Write the introduction.',
  skill_id: 's1',
  skill_name: 'Biology',
  starts_at: STARTED_AT.toISOString(),
  ends_at: new Date(2026, 9, 26, 11).toISOString(),
};
const SIGNED_IN = create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 26, 10, 0, 2));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WorkBlockTimer', () => {
  it('counts down the focus time and lets the student end early', async () => {
    const on_end_early = vi.fn();
    render(<WorkBlockTimer work_block={WORK_BLOCK} on_focus_complete={vi.fn()} on_end_early={on_end_early} />);

    expect(screen.getByRole('timer', { name: 'Focus time time left' })).toHaveTextContent('24:58');
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole('timer')).toHaveTextContent('24:55');

    screen.getByRole('button', { name: 'End block' }).click();
    expect(on_end_early).toHaveBeenCalledWith(expect.objectContaining({ phase: 'focus' }));
  });

  it('chimes, announces the break and records the focus time once it ends', () => {
    vi.setSystemTime(new Date(2026, 9, 26, 10, 24, 59));
    const on_focus_complete = vi.fn();
    render(<WorkBlockTimer work_block={WORK_BLOCK} on_focus_complete={on_focus_complete} on_end_early={vi.fn()} />);

    act(() => vi.advanceTimersByTime(2000));

    expect(screen.getByText('Break')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Focus time is over. Take a 5-minute break.');
    expect(play_chime).toHaveBeenCalledTimes(1);
    expect(on_focus_complete).toHaveBeenCalledWith(expect.objectContaining({ phase: 'break', focused_minutes: 25 }));
  });

  it('shows the summary when the whole block is done', () => {
    vi.setSystemTime(new Date(2026, 9, 26, 11));
    render(
      <WorkBlockTimer work_block={{ ...WORK_BLOCK, ended_at: 'x' }} on_focus_complete={vi.fn()} on_end_early={vi.fn()} />,
    );

    expect(screen.getByText('Nice work! You focused for 25 minutes.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End block' })).not.toBeInTheDocument();
  });
});

describe('WorkBlockPage', () => {
  it('offers both activities', () => {
    expect(ACTIVITY_OPTIONS.map((option) => option.value)).toEqual(['assignment', 'quiz']);
  });

  it('starts a block for the event and shows the assignment', async () => {
    schedule_service.fetch_active_work_block.mockResolvedValue(null);
    schedule_service.fetch_event.mockResolvedValue(EVENT);
    schedule_service.start_work_block.mockResolvedValue(WORK_BLOCK);
    render_in_router(<WorkBlockPage />, { initial_path: '/dashboard/work-block?event=e1', auth_value: SIGNED_IN });

    expect(await screen.findByText('Biology essay')).toBeInTheDocument();
    expect(screen.getByLabelText('During this block I will')).toHaveValue('assignment');
    await act(async () => screen.getByRole('button', { name: 'Start work block' }).click());

    expect(schedule_service.start_work_block).toHaveBeenCalledWith({ activity: 'assignment', event_id: 'e1' });
    expect(await screen.findByRole('timer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Biology essay' })).toBeInTheDocument();
    expect(screen.getByText('Write the introduction.')).toBeInTheDocument();
  });

  it('picks up a running block after a reload and switches to a quiz', async () => {
    schedule_service.fetch_active_work_block.mockResolvedValue(WORK_BLOCK);
    render_in_router(<WorkBlockPage />, { initial_path: '/dashboard/work-block', auth_value: SIGNED_IN });

    expect(await screen.findByRole('timer')).toHaveTextContent('24:58');
    vi.useRealTimers();
    await userEvent.selectOptions(screen.getByLabelText('During this block I will'), 'quiz');

    expect(await screen.findByText(/Add a skill on the/)).toBeInTheDocument();
  });

  it('records the minutes when the student ends early', async () => {
    vi.setSystemTime(new Date(2026, 9, 26, 10, 12, 30));
    schedule_service.fetch_active_work_block.mockResolvedValue(WORK_BLOCK);
    schedule_service.finish_work_block.mockResolvedValue({ ...WORK_BLOCK, ended_at: 'now' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render_in_router(<WorkBlockPage />, { initial_path: '/dashboard/work-block', auth_value: SIGNED_IN });

    await screen.findByRole('timer');
    await act(async () => screen.getByRole('button', { name: 'End block' }).click());

    expect(schedule_service.finish_work_block).toHaveBeenCalledWith('w1', { completed_minutes: 12, activity: 'assignment' });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Block ended. You focused for 12 minutes.'));
  });

  it('records the block when focus time ends, then offers another', async () => {
    vi.setSystemTime(new Date(2026, 9, 26, 10, 26));
    schedule_service.fetch_active_work_block.mockResolvedValue(WORK_BLOCK);
    schedule_service.finish_work_block.mockResolvedValue({ ...WORK_BLOCK, completed_minutes: 25, ended_at: 'now' });
    render_in_router(<WorkBlockPage />, { initial_path: '/dashboard/work-block', auth_value: SIGNED_IN });

    await waitFor(() =>
      expect(schedule_service.finish_work_block).toHaveBeenCalledWith('w1', { completed_minutes: 25, activity: 'assignment' }),
    );
    expect(await screen.findByRole('button', { name: 'Start another block' })).toBeInTheDocument();
  });
});
