import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render_in_router } from './helpers/render_helpers.jsx';

vi.mock('../src/services/skill_service.js', () => ({ fetch_skills: vi.fn() }));
vi.mock('../src/services/topic_service.js', () => ({ fetch_topic_map: vi.fn().mockResolvedValue({ topics: [], suggestions: [] }) }));
vi.mock('../src/services/learning_service.js', () => ({
  fetch_learning_path: vi.fn(),
  build_learning_path: vi.fn(),
  fetch_guided_lessons: vi.fn().mockResolvedValue([]),
  start_guided_lesson: vi.fn(),
  fetch_guided_lesson: vi.fn(),
  fetch_practice_sets: vi.fn().mockResolvedValue([]),
  create_practice_set: vi.fn(),
  fetch_practice_set: vi.fn(),
  delete_guided_lesson: vi.fn(),
  delete_practice_set: vi.fn(),
  fetch_reading_list: vi.fn().mockResolvedValue([]),
  fetch_reading: vi.fn(),
  fetch_reading_section: vi.fn(),
  guide_reading_section: vi.fn(),
  fetch_glossary: vi.fn().mockResolvedValue([]),
  explain_another_way: vi.fn(),
}));

const { fetch_skills } = await import('../src/services/skill_service.js');
const learning_service = await import('../src/services/learning_service.js');
const { DEFAULT_LEARN_TAB, find_learn_tab, LEARN_TABS, default: LearnTabs } = await import('../src/components/learn/LearnTabs.jsx');
const { default: LearnPage } = await import('../src/pages/dashboard/LearnPage.jsx');

const SKILLS = [
  { id: 's1', name: 'Biology', resource_count: 1 },
  { id: 's2', name: 'Maths', resource_count: 0 },
];
const CHECK = { reteach_markdown: null, question: 'What holds DNA?', choices: ['Nucleus', 'Wall', 'Ribosome', 'Vacuole'], chosen_index: null };
const LESSON = {
  id: 'l1',
  skill_id: 's1',
  topic_id: null,
  topic: 'Cells',
  step_count: 1,
  current_step: 0,
  is_complete: false,
  steps: [{ title: 'The nucleus', explanation_markdown: 'It holds DNA.', example_markdown: '', checks: [CHECK] }],
  can_reteach: false,
  first_try_correct: null,
};
const PRACTICE_SET = {
  id: 'p1',
  skill_id: 's1',
  topic: 'Equations',
  worked_example: { problem: 'x + 1 = 2', steps: ['Take 1.'], answer: 'x = 1' },
  problems: [],
  solved_count: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  fetch_skills.mockResolvedValue(SKILLS);
  learning_service.fetch_learning_path.mockResolvedValue({ has_path: false, created_at: null, steps: [], new_topic_count: 0, topic_count: 2 });
});

describe('LearnTabs', () => {
  it('falls back to the learning path for an unknown tab', () => {
    expect(find_learn_tab('reading')).toBe('reading');
    expect(find_learn_tab('nope')).toBe(DEFAULT_LEARN_TAB);
    expect(find_learn_tab(null)).toBe('path');
  });

  it('links every tab and marks the current one', () => {
    render_in_router(<LearnTabs skill_id="s1" current_tab="terms" />);
    expect(screen.getAllByRole('link')).toHaveLength(LEARN_TABS.length);
    expect(screen.getByRole('link', { name: 'Key terms' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Reading' })).toHaveAttribute('href', '/dashboard/learn?skill=s1&tab=reading');
  });
});

describe('LearnPage', () => {
  it('starts on the first skill’s learning path, and switches skill', async () => {
    const { router } = render_in_router(<LearnPage />, { initial_path: '/dashboard/learn' });

    expect(await screen.findByRole('heading', { name: 'Your learning path' })).toBeInTheDocument();
    expect(learning_service.fetch_learning_path).toHaveBeenCalledWith('s1');
    await userEvent.selectOptions(screen.getByLabelText('Skill'), 's2');
    await waitFor(() => expect(router.state.location.search).toBe('?skill=s2&tab=path'));
    expect(learning_service.fetch_learning_path).toHaveBeenLastCalledWith('s2');
  });

  it('shows each tab from the address', async () => {
    const { router } = render_in_router(<LearnPage />, { initial_path: '/dashboard/learn?skill=s1&tab=terms' });
    expect(await screen.findByRole('heading', { name: 'Key terms' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Reading' }));
    expect(await screen.findByRole('heading', { name: 'Read with a guide' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Guided lessons' }));
    expect(await screen.findByRole('heading', { name: 'Start a guided lesson' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Practice' }));
    expect(await screen.findByRole('heading', { name: 'Practise a topic' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?skill=s1&tab=practice');
  });

  it('opens a started lesson without loading it again, and goes back to the tab', async () => {
    learning_service.start_guided_lesson.mockResolvedValue(LESSON);
    fetch_skills.mockResolvedValue(SKILLS);
    const { router } = render_in_router(<LearnPage />, { initial_path: '/dashboard/learn?skill=s1&tab=lessons' });

    await screen.findByLabelText('Your topic');
    await userEvent.type(screen.getByLabelText('Your topic'), 'Cells');
    await userEvent.click(screen.getByRole('button', { name: 'Start the lesson' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'The nucleus' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?skill=s1&tab=lessons&lesson=l1');
    expect(learning_service.fetch_guided_lesson).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Skill')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back to guided lessons' }));
    expect(await screen.findByRole('heading', { name: 'Start a guided lesson' })).toBeInTheDocument();
  });

  it('loads a lesson, a practice set or a resource named in the address', async () => {
    learning_service.fetch_guided_lesson.mockResolvedValue(LESSON);
    learning_service.fetch_practice_set.mockResolvedValue(PRACTICE_SET);
    learning_service.fetch_reading.mockRejectedValue(new Error('Resource not found'));

    const lesson_view = render_in_router(<LearnPage />, { initial_path: '/dashboard/learn?skill=s1&lesson=l1' });
    expect(await screen.findByRole('heading', { level: 2, name: 'The nucleus' })).toBeInTheDocument();
    expect(learning_service.fetch_guided_lesson).toHaveBeenCalledWith('l1');
    expect(screen.getByRole('link', { name: 'Back to learning path' })).toHaveAttribute('href', '/dashboard/learn?skill=s1&tab=path');
    lesson_view.unmount();

    const practice_view = render_in_router(<LearnPage />, { initial_path: '/dashboard/learn?skill=s1&tab=practice&practice=p1' });
    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument();
    practice_view.unmount();

    render_in_router(<LearnPage />, { initial_path: '/dashboard/learn?skill=s1&tab=reading&read=r1' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Resource not found');
  });

  it('opens a lesson from the path, and shows a lesson that fails to load', async () => {
    learning_service.fetch_learning_path.mockResolvedValue({
      has_path: true,
      created_at: '2026-10-24',
      new_topic_count: 0,
      topic_count: 1,
      steps: [
        {
          topic_id: 't1',
          topic: 'Cells',
          summary: '',
          parent_topic: '',
          reason: '',
          is_new: false,
          mastery_level: 'untested',
          lesson: { latest_lesson_id: 'l1', is_latest_complete: false, has_finished: false },
          status: 'next',
        },
      ],
    });
    learning_service.fetch_guided_lesson.mockRejectedValue(new Error('Lesson not found'));
    const { router } = render_in_router(<LearnPage />, { initial_path: '/dashboard/learn?skill=s1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Continue lesson: Cells' }));
    expect(router.state.location.search).toBe('?skill=s1&tab=path&lesson=l1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Lesson not found');
  });

  it('points to the skill map with no skills, and shows loading errors', async () => {
    fetch_skills.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Offline'));
    const { unmount } = render_in_router(<LearnPage />, { initial_path: '/dashboard/learn' });
    expect(await screen.findByRole('link', { name: 'skill map' })).toHaveAttribute('href', '/dashboard/skill-map');
    unmount();
    render_in_router(<LearnPage />, { initial_path: '/dashboard/learn' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  });

  it('opens saved lessons, new or saved practice, and resources from their tabs', async () => {
    const saved_item = { topic: 'Cells', created_at: '2026-10-24T10:00:00Z' };
    learning_service.fetch_guided_lessons.mockResolvedValue([{ ...saved_item, id: 'l1', is_complete: true, current_step: 0, step_count: 1 }]);
    learning_service.fetch_practice_sets.mockResolvedValue([{ ...saved_item, id: 'p0', problem_count: 2, solved_count: 0 }]);
    learning_service.create_practice_set.mockResolvedValue(PRACTICE_SET);
    learning_service.fetch_reading_list.mockResolvedValue([{ resource_id: 'r1', title: 'Week 1', resource_type: 'note', section_count: 2, position: 0 }]);
    learning_service.fetch_reading.mockReturnValue(new Promise(() => {}));
    const { router } = render_in_router(<LearnPage />, { initial_path: '/dashboard/learn?skill=s1&tab=lessons' });

    await userEvent.click(await screen.findByRole('button', { name: 'Review the lesson on Cells' }));
    expect(router.state.location.search).toBe('?skill=s1&tab=lessons&lesson=l1');

    await router.navigate('/dashboard/learn?skill=s1&tab=practice');
    await userEvent.click(await screen.findByRole('button', { name: 'Continue the practice on Cells' }));
    expect(router.state.location.search).toBe('?skill=s1&tab=practice&practice=p0');
    await router.navigate('/dashboard/learn?skill=s1&tab=practice');
    await userEvent.type(await screen.findByLabelText('Your topic'), 'Equations');
    await userEvent.click(screen.getByRole('button', { name: 'Make practice problems' }));
    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?skill=s1&tab=practice&practice=p1');

    await router.navigate('/dashboard/learn?skill=s1&tab=reading');
    await userEvent.click(await screen.findByRole('button', { name: 'Start reading Week 1' }));
    expect(router.state.location.search).toBe('?skill=s1&tab=reading&read=r1');
    expect(await screen.findByText('Opening your resource…')).toBeInTheDocument();
  });
});
