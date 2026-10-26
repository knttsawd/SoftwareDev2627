import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render_in_router } from './helpers/render_helpers.jsx';

vi.mock('../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue('response') }));
vi.mock('../src/services/progress_service.js', async (import_original) => ({
  ...(await import_original()),
  fetch_progress: vi.fn(),
}));

const { send_authed_request } = await import('../src/services/auth_service.js');
const progress_service = await import('../src/services/progress_service.js');
const { describe_change, format_minutes, format_points, group_minutes_by_day } = await import('../src/utils/progress.js');
const { default: StatTile } = await import('../src/components/progress/StatTile.jsx');
const { describe_study_time, get_axis_top, default: StudyTimeChart } = await import('../src/components/progress/StudyTimeChart.jsx');
const { describe_skill_facts, default: SkillProgressList } = await import('../src/components/progress/SkillProgressList.jsx');
const { default: TopicChanges } = await import('../src/components/progress/TopicChanges.jsx');
const { build_stat_tiles, format_percent_value, default: ProgressPage } = await import('../src/pages/dashboard/ProgressPage.jsx');

// Saturday 24 Oct 2026, mid-afternoon local time.
const NOW = new Date(2026, 9, 24, 15);
const SKILL_PROGRESS = {
  skill_id: 's1',
  name: 'Biology',
  color: '#15803D',
  topic_count: 4,
  resource_count: 1,
  level_counts: { strong: 1, developing: 1, weak: 1, untested: 1 },
  quizzed_percent: 75,
  strong_percent: 25,
  average_mastery: 57,
};
const PROGRESS = {
  skills: [SKILL_PROGRESS, { ...SKILL_PROGRESS, skill_id: 's2', name: 'Guitar', topic_count: 0, average_mastery: null }],
  quiz_scores: { recent: 72, previous: 64, change: 8, period_days: 30 },
  study_minutes: { recent: 85, previous: 100, change: -15, period_days: 7 },
  recent_work_blocks: [
    { started_at: new Date(2026, 9, 24, 9).toISOString(), completed_minutes: 25 },
    { started_at: new Date(2026, 9, 24, 13).toISOString(), completed_minutes: 20 },
    { started_at: new Date(2026, 9, 22, 18).toISOString(), completed_minutes: 40 },
  ],
  topic_changes: {
    improved: [{ topic_id: 't1', topic: 'Cells', skill_name: 'Biology', first_score: 40, latest_score: 90, change: 50, quiz_count: 3 }],
    slipping: [],
  },
  teaching: { lessons_done: 1, grades: { recent: 70, previous: null, change: null, period_days: 30 } },
  totals: { quizzes_taken: 5, topics_total: 4, topics_strong: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('progress helpers', () => {
  it('writes minutes and points in words', () => {
    expect(format_minutes(0)).toBe('0 min');
    expect(format_minutes(45)).toBe('45 min');
    expect(format_minutes(60)).toBe('1 h');
    expect(format_minutes(85)).toBe('1 h 25 min');
    expect(format_points(1)).toBe('1 point');
    expect(format_points(8)).toBe('8 points');
  });

  it('describes a change against the period before', () => {
    expect(describe_change(8, 30)).toEqual({ direction: 'up', text: 'Up 8 points on the 30 days before' });
    expect(describe_change(-15, 7, format_minutes)).toEqual({ direction: 'down', text: 'Down 15 min on the 7 days before' });
    expect(describe_change(0, 7)).toEqual({ direction: 'same', text: 'The same as the 7 days before' });
    expect(describe_change(null, 30).direction).toBeNull();
  });

  it('adds up focus minutes for each local day, oldest first', () => {
    const day_minutes = group_minutes_by_day(PROGRESS.recent_work_blocks, NOW, 3);

    expect(day_minutes.map((day_total) => [day_total.day.getDate(), day_total.minutes])).toEqual([
      [22, 40],
      [23, 0],
      [24, 45],
    ]);
  });

  it('calls the progress endpoint', async () => {
    const real_service = await vi.importActual('../src/services/progress_service.js');

    await real_service.fetch_progress();

    expect(send_authed_request).toHaveBeenCalledWith('/progress');
  });
});

describe('StatTile', () => {
  it('shows the value and its change in words', () => {
    render(<StatTile label="Focus time" value="1 h" change={{ direction: 'down', text: 'Down 15 min on the 7 days before' }} />);

    expect(screen.getByText('1 h')).toBeInTheDocument();
    expect(screen.getByText('Down 15 min on the 7 days before')).toBeInTheDocument();
  });
});

describe('StudyTimeChart', () => {
  it('rounds the top of the chart up to a clean number', () => {
    expect(get_axis_top([{ minutes: 0 }])).toBe(30);
    expect(get_axis_top([{ minutes: 45 }, { minutes: 10 }])).toBe(60);
  });

  it('describes the chart in words for screen readers', () => {
    expect(describe_study_time(group_minutes_by_day(PROGRESS.recent_work_blocks, NOW, 3))).toMatch(/^1 h 25 min of focus over the last 3 days, most on/);
  });

  it('draws one column per day, labels the busiest, and offers a table', () => {
    render(<StudyTimeChart work_blocks={PROGRESS.recent_work_blocks} now={NOW} />);

    expect(screen.getByRole('img')).toHaveAccessibleName(/^1 h 25 min of focus over the last 14 days/);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(15);
    expect(within(table).getAllByRole('row').at(-1)).toHaveTextContent('45 min');
  });

  it('points to work blocks when there is no focus time to draw', () => {
    render_in_router(<StudyTimeChart work_blocks={[]} now={NOW} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/No focus time in the last 14 days yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a work block' })).toHaveAttribute('href', '/dashboard/work-block');
  });
});

describe('SkillProgressList', () => {
  it("shows each skill's quizzed and strong bars, or a link to add topics", () => {
    render_in_router(<SkillProgressList skills={PROGRESS.skills} />);

    expect(screen.getByRole('progressbar', { name: 'Biology, topics quizzed: 75%' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Biology, topics strong: 25%' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add topics to Guitar' })).toHaveAttribute('href', '/dashboard/skill-map?skill=s2');
    expect(describe_skill_facts(SKILL_PROGRESS)).toBe('4 topics · 1 resource · average 57%');
  });

  it('points to the skill map with no skills', () => {
    render_in_router(<SkillProgressList skills={[]} />);

    expect(screen.getByRole('link', { name: 'skill map' })).toBeInTheDocument();
  });
});

describe('TopicChanges', () => {
  it('lists improved topics and explains an empty list', () => {
    render(<TopicChanges topic_changes={PROGRESS.topic_changes} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('CellsBiology · 3 quizzes · 40% to 90%Up 50 points');
    expect(screen.getByText('No topic has slipped since you first quizzed it.')).toBeInTheDocument();
  });
});

describe('ProgressPage', () => {
  it('builds the headline numbers', () => {
    const stat_tiles = build_stat_tiles(PROGRESS);

    expect(stat_tiles.map((stat_tile) => stat_tile.value)).toEqual(['72%', '1 h 25 min', '1 of 4', '70%']);
    expect(stat_tiles[3].change.direction).toBeNull();
    expect(format_percent_value(null)).toBe('–');
  });

  it('shows the summary, skills, focus time and topic changes', async () => {
    progress_service.fetch_progress.mockResolvedValue(PROGRESS);
    render_in_router(<ProgressPage now={NOW} />);

    const summary = await screen.findByRole('list', { name: 'Summary' });
    expect(within(summary).getAllByRole('listitem')).toHaveLength(4);
    expect(summary).toHaveTextContent('Up 8 points on the 30 days before');
    expect(screen.getByRole('heading', { level: 2, name: 'Focus time per day' })).toBeInTheDocument();
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
  });

  it('shows load errors', async () => {
    progress_service.fetch_progress.mockRejectedValue(new Error('Server down'));
    render_in_router(<ProgressPage now={NOW} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
  });
});
