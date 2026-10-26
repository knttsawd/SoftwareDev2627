import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render_in_router } from './helpers/render_helpers.jsx';

vi.mock('../src/services/topic_service.js', () => ({ fetch_topic_map: vi.fn() }));
vi.mock('../src/services/learning_service.js', () => ({
  fetch_learning_path: vi.fn(),
  build_learning_path: vi.fn(),
  fetch_guided_lessons: vi.fn(),
  start_guided_lesson: vi.fn(),
  answer_lesson_check: vi.fn(),
  reteach_lesson_step: vi.fn(),
  go_to_next_step: vi.fn(),
  delete_guided_lesson: vi.fn(),
  fetch_practice_sets: vi.fn(),
  create_practice_set: vi.fn(),
  show_practice_hint: vi.fn(),
  show_practice_solution: vi.fn(),
  check_practice_answer: vi.fn(),
  delete_practice_set: vi.fn(),
  fetch_reading_list: vi.fn(),
  fetch_reading: vi.fn(),
  fetch_reading_section: vi.fn(),
  guide_reading_section: vi.fn(),
  save_reading_position: vi.fn(),
  explain_reading_passage: vi.fn(),
  fetch_glossary: vi.fn(),
  add_glossary_term: vi.fn(),
  generate_glossary: vi.fn(),
  delete_glossary_term: vi.fn(),
  explain_another_way: vi.fn(),
}));

const { fetch_topic_map } = await import('../src/services/topic_service.js');
const learning_service = await import('../src/services/learning_service.js');
const { EXPLAIN_STYLE_DETAILS, default: ExplainAnotherWay } = await import('../src/components/learn/ExplainAnotherWay.jsx');
const { list_count_options, default: LearnTopicForm } = await import('../src/components/learn/LearnTopicForm.jsx');
const { default: SavedActivityList } = await import('../src/components/learn/SavedActivityList.jsx');
const { describe_lesson_progress, default: LessonsPanel } = await import('../src/components/learn/LessonsPanel.jsx');
const { describe_practice_progress, default: PracticePanel } = await import('../src/components/learn/PracticePanel.jsx');
const { describe_step_outcome, get_next_label, default: GuidedLessonView } = await import('../src/components/learn/GuidedLessonView.jsx');
const { describe_hint_count, default: PracticeView } = await import('../src/components/learn/PracticeView.jsx');
const { describe_reading_progress, default: ReadingList } = await import('../src/components/learn/ReadingList.jsx');
const { read_selected_passage, default: ReadingView } = await import('../src/components/learn/ReadingView.jsx');
const { describe_added_terms, filter_glossary_terms, insert_term_in_order, default: GlossaryPanel } = await import(
  '../src/components/learn/GlossaryPanel.jsx'
);
const { count_done_steps, describe_new_topics, get_lesson_action, PATH_STATUS_DETAILS, default: LearningPathPanel } = await import(
  '../src/components/learn/LearningPathPanel.jsx'
);
const { default: TopicKeyTerms } = await import('../src/components/learn/TopicKeyTerms.jsx');

const SKILL = { id: 's1', name: 'Biology', resource_count: 1 };
const TOPICS = [
  { id: 't1', topic: 'Cells', parent_node_id: null, mastery_score: null, mastery_level: 'untested' },
  { id: 't2', topic: 'Mitosis', parent_node_id: 't1', mastery_score: null, mastery_level: 'untested' },
];
const UNANSWERED_CHECK = { reteach_markdown: null, question: 'What holds DNA?', choices: ['Nucleus', 'Wall', 'Ribosome', 'Vacuole'], chosen_index: null };
const WRONG_CHECK = { ...UNANSWERED_CHECK, chosen_index: 1, correct_index: 0, explanation: 'The nucleus does.', is_correct: false };
const RIGHT_CHECK = { ...UNANSWERED_CHECK, chosen_index: 0, correct_index: 0, explanation: 'The nucleus does.', is_correct: true };
const STEP = { title: 'The nucleus', explanation_markdown: 'The nucleus holds DNA.', example_markdown: 'Like a library.', checks: [UNANSWERED_CHECK] };
const LESSON = {
  id: 'l1',
  skill_id: 's1',
  topic_id: 't1',
  topic: 'Cells',
  step_count: 2,
  current_step: 0,
  is_complete: false,
  steps: [STEP],
  can_reteach: false,
  first_try_correct: null,
};
const PROBLEM = {
  problem: '2x = 4',
  hints: [],
  hint_count: 3,
  attempts: [],
  is_solved: false,
  is_solution_shown: false,
  solution_steps: null,
  answer: null,
};
const PRACTICE_SET = {
  id: 'p1',
  skill_id: 's1',
  topic: 'Equations',
  worked_example: { problem: 'x + 1 = 2', steps: ['Take 1 from both sides.'], answer: 'x = 1' },
  problems: [PROBLEM],
  solved_count: 0,
};

// A use_api_data result for a list that has loaded.
function loaded_state(data) {
  return { data, error: '', is_loading: false, set_data: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetch_topic_map.mockResolvedValue({ topics: TOPICS, suggestions: [] });
});

describe('ExplainAnotherWay', () => {
  it('asks for each style, shows the answer under its heading, and closes it', async () => {
    learning_service.explain_another_way.mockResolvedValue({ explanation_markdown: 'Cells are **tiny**.' });
    render(<ExplainAnotherWay skill_id="s1" text={'x'.repeat(7000)} topic_id="t1" />);

    await userEvent.click(screen.getByRole('button', { name: EXPLAIN_STYLE_DETAILS.simpler.label }));

    expect(learning_service.explain_another_way).toHaveBeenCalledWith('s1', { text: 'x'.repeat(6000), style: 'simpler', topic_id: 't1' });
    expect(await screen.findByText('In simpler words')).toBeInTheDocument();
    expect(screen.getByText('tiny').tagName).toBe('STRONG');
    await userEvent.click(screen.getByRole('button', { name: 'Close this explanation' }));
    expect(screen.queryByText('In simpler words')).not.toBeInTheDocument();
  });

  it('leaves out a missing topic and shows errors', async () => {
    learning_service.explain_another_way.mockRejectedValue(new Error('The AI is busy right now'));
    render(<ExplainAnotherWay skill_id="s1" text="Cells" />);

    await userEvent.click(screen.getByRole('button', { name: 'Go deeper' }));

    expect(learning_service.explain_another_way).toHaveBeenCalledWith('s1', { text: 'Cells', style: 'deeper' });
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now');
  });
});

describe('LearnTopicForm', () => {
  const form_props = {
    skill: SKILL,
    form_id: 'lesson',
    heading: 'Start a guided lesson',
    count_field: 'step_count',
    count_label: 'Steps',
    count_limits: { min: 3, max: 6, default: 4 },
    submit_label: 'Start the lesson',
    busy_label: 'Writing…',
  };

  it('lists the counts in range', () => {
    expect(list_count_options({ min: 3, max: 6 })).toEqual([3, 4, 5, 6]);
  });

  it('chooses the first topic once loaded, or the one asked for, and sends the count', async () => {
    const on_submit = vi.fn().mockResolvedValue(undefined);
    render(<LearnTopicForm {...form_props} initial_topic_id="t2" on_submit={on_submit} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Start the lesson' })).toBeEnabled());
    expect(screen.getByLabelText('Topic')).toHaveValue('t2');
    await userEvent.selectOptions(screen.getByLabelText('Steps'), '6');
    await userEvent.click(screen.getByRole('button', { name: 'Start the lesson' }));

    expect(on_submit).toHaveBeenCalledWith({ topic_id: 't2', step_count: 6 });
  });

  it('switches to typing a topic when the skill has none, and shows field errors', async () => {
    fetch_topic_map.mockResolvedValue({ topics: [], suggestions: [] });
    const on_submit = vi.fn().mockRejectedValue(Object.assign(new Error('Please fix the highlighted fields'), { field_errors: { topic: 'Topic is required' } }));
    render(<LearnTopicForm {...form_props} on_submit={on_submit} />);

    await screen.findByLabelText('Your topic');
    await userEvent.click(screen.getByRole('button', { name: 'Start the lesson' }));

    expect(on_submit).toHaveBeenCalledWith({ topic: '', step_count: 4 });
    expect(await screen.findByText('Topic is required')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields');
  });
});

describe('SavedActivityList', () => {
  const list_props = {
    noun: 'lesson',
    empty_text: 'No lessons yet.',
    describe: (item) => `About ${item.topic}`,
    get_open_label: () => 'Continue',
  };

  it('shows loading, errors and the empty text', () => {
    const { rerender } = render(<SavedActivityList {...list_props} items_state={{ data: null, is_loading: true, error: '' }} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    rerender(<SavedActivityList {...list_props} items_state={{ data: null, is_loading: false, error: 'Offline' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    rerender(<SavedActivityList {...list_props} items_state={loaded_state([])} />);
    expect(screen.getByText('No lessons yet.')).toBeInTheDocument();
  });

  it('opens items, and deletes them after confirmation', async () => {
    const items_state = loaded_state([{ id: 'l1', topic: 'Cells', created_at: '2026-10-24T10:00:00Z' }]);
    const on_open = vi.fn();
    const delete_item = vi.fn().mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SavedActivityList {...list_props} items_state={items_state} on_open={on_open} delete_item={delete_item} />);

    expect(screen.getByText(/About Cells/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue the lesson on Cells' }));
    expect(on_open).toHaveBeenCalledWith('l1');
    await userEvent.click(screen.getByRole('button', { name: 'Delete the lesson on Cells' }));
    expect(delete_item).toHaveBeenCalledWith('l1');
    expect(items_state.set_data.mock.calls[0][0]([{ id: 'l1' }, { id: 'l2' }])).toEqual([{ id: 'l2' }]);
  });

  it('shows a failed delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const delete_item = vi.fn().mockRejectedValue(new Error('Could not delete'));
    render(
      <SavedActivityList
        {...list_props}
        items_state={loaded_state([{ id: 'l1', topic: 'Cells', created_at: '2026-10-24T10:00:00Z' }])}
        on_open={vi.fn()}
        delete_item={delete_item}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete the lesson on Cells' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete');
  });
});

describe('LessonsPanel and PracticePanel', () => {
  it('describes progress', () => {
    expect(describe_lesson_progress({ is_complete: false, current_step: 1, step_count: 4 })).toBe('Step 2 of 4');
    expect(describe_lesson_progress({ is_complete: true })).toBe('Finished');
    expect(describe_practice_progress({ solved_count: 1, problem_count: 3 })).toBe('1 of 3 solved');
  });

  it('starts a lesson and lists past ones', async () => {
    learning_service.fetch_guided_lessons.mockResolvedValue([
      { id: 'l0', topic: 'Old', is_complete: true, current_step: 2, step_count: 3, created_at: '2026-10-20T10:00:00Z' },
    ]);
    learning_service.start_guided_lesson.mockResolvedValue(LESSON);
    const on_started = vi.fn();
    render(<LessonsPanel skill={SKILL} on_started={on_started} on_open={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Review the lesson on Old' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start the lesson' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Start the lesson' }));

    expect(learning_service.start_guided_lesson).toHaveBeenCalledWith('s1', { topic_id: 't1', step_count: 4 });
    expect(on_started).toHaveBeenCalledWith(LESSON);
  });

  it('makes practice problems and lists earlier practice', async () => {
    learning_service.fetch_practice_sets.mockResolvedValue([
      { id: 'p0', topic: 'Old', problem_count: 2, solved_count: 2, created_at: '2026-10-20T10:00:00Z' },
    ]);
    learning_service.create_practice_set.mockResolvedValue(PRACTICE_SET);
    const on_created = vi.fn();
    render(<PracticePanel skill={SKILL} initial_topic_id="t2" on_created={on_created} on_open={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Review the practice on Old' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Make practice problems' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Make practice problems' }));

    expect(learning_service.create_practice_set).toHaveBeenCalledWith('s1', { topic_id: 't2', problem_count: 3 });
    expect(on_created).toHaveBeenCalledWith(PRACTICE_SET);
  });
});

describe('GuidedLessonView', () => {
  it('describes how each step went and what the next button says', () => {
    expect(describe_step_outcome({ checks: [UNANSWERED_CHECK] })).toBe('Not answered yet');
    expect(describe_step_outcome({ checks: [RIGHT_CHECK] })).toBe('Right first time');
    expect(describe_step_outcome({ checks: [WRONG_CHECK, RIGHT_CHECK] })).toBe('Got it after another explanation');
    expect(describe_step_outcome({ checks: [WRONG_CHECK, WRONG_CHECK] })).toBe('Worth another look');
    expect(get_next_label({ current_step: 0, step_count: 2 }, true)).toBe('Next step');
    expect(get_next_label({ current_step: 0, step_count: 2 }, false)).toBe('Move on');
    expect(get_next_label({ current_step: 1, step_count: 2 }, true)).toBe('Finish the lesson');
    expect(get_next_label({ current_step: 1, step_count: 2 }, false)).toBe('Finish anyway');
  });

  it('teaches the step and sends the chosen answer', async () => {
    const answered_lesson = { ...LESSON, steps: [{ ...STEP, checks: [WRONG_CHECK] }], can_reteach: true };
    learning_service.answer_lesson_check.mockResolvedValue(answered_lesson);
    const on_lesson_changed = vi.fn();
    render_in_router(<GuidedLessonView lesson={LESSON} on_lesson_changed={on_lesson_changed} />);

    expect(screen.getByRole('heading', { level: 2, name: 'The nucleus' })).toBeInTheDocument();
    expect(screen.getByText('Like a library.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check my answer' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Wall/));
    await userEvent.click(screen.getByRole('button', { name: 'Check my answer' }));

    expect(learning_service.answer_lesson_check).toHaveBeenCalledWith('l1', 1);
    expect(on_lesson_changed).toHaveBeenCalledWith(answered_lesson);
  });

  it('after a wrong answer, explains again or moves on', async () => {
    const missed_lesson = { ...LESSON, steps: [{ ...STEP, checks: [WRONG_CHECK] }], can_reteach: true };
    const retaught_lesson = { ...missed_lesson, steps: [{ ...STEP, checks: [WRONG_CHECK, { ...UNANSWERED_CHECK, reteach_markdown: 'Think of a library.' }] }], can_reteach: false };
    learning_service.reteach_lesson_step.mockResolvedValue(retaught_lesson);
    learning_service.go_to_next_step.mockRejectedValue(new Error('Answer the question first.'));
    const on_lesson_changed = vi.fn();
    const { rerender } = render(<GuidedLessonView lesson={missed_lesson} on_lesson_changed={on_lesson_changed} />);

    expect(screen.getByRole('status')).toHaveTextContent('Not quite. The answer is A: Nucleus');
    await userEvent.click(screen.getByRole('button', { name: 'Explain it another way' }));
    expect(on_lesson_changed).toHaveBeenCalledWith(retaught_lesson);

    rerender(<GuidedLessonView lesson={retaught_lesson} on_lesson_changed={on_lesson_changed} />);
    expect(screen.getByText('Another way to look at it')).toBeInTheDocument();
    expect(screen.getByText('Think of a library.')).toBeInTheDocument();

    rerender(<GuidedLessonView lesson={missed_lesson} on_lesson_changed={on_lesson_changed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move on' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Answer the question first.');
  });

  it('moves to the next step after a right answer, folding earlier steps away', async () => {
    const right_lesson = { ...LESSON, steps: [{ ...STEP, checks: [RIGHT_CHECK] }] };
    const next_lesson = { ...LESSON, current_step: 1, steps: [{ ...STEP, checks: [RIGHT_CHECK] }, { ...STEP, title: 'Membranes' }] };
    learning_service.go_to_next_step.mockResolvedValue(next_lesson);
    const on_lesson_changed = vi.fn();
    const { rerender } = render(<GuidedLessonView lesson={right_lesson} on_lesson_changed={on_lesson_changed} />);

    await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(on_lesson_changed).toHaveBeenCalledWith(next_lesson);

    rerender(<GuidedLessonView lesson={next_lesson} on_lesson_changed={on_lesson_changed} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Membranes' })).toHaveFocus();
    expect(screen.getByText('Step 1: The nucleus')).toBeInTheDocument();
    expect(screen.getByText('Right first time')).toBeInTheDocument();
  });

  it('sums up a finished lesson with ways to keep going', () => {
    const done_lesson = { ...LESSON, current_step: 1, is_complete: true, first_try_correct: 1, steps: [{ ...STEP, checks: [RIGHT_CHECK] }, { ...STEP, title: 'Membranes', checks: [WRONG_CHECK] }] };
    render_in_router(<GuidedLessonView lesson={done_lesson} on_lesson_changed={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Lesson finished' })).toBeInTheDocument();
    expect(screen.getByText(/You got 1 of 2 checks right first time/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practise this topic' })).toHaveAttribute('href', '/dashboard/learn?skill=s1&tab=practice&topic=t1');
    expect(screen.getByRole('link', { name: 'Quiz me on it' })).toHaveAttribute('href', '/dashboard/quiz?skill=s1&topic=t1');
    expect(screen.getByRole('link', { name: 'Teach it to Pip' })).toBeInTheDocument();
  });
});

describe('PracticeView', () => {
  it('counts hints', () => {
    expect(describe_hint_count({ hints: ['a'], hint_count: 3 })).toBe('Hints (1 of 3)');
  });

  it('shows the worked example, then gives hints and the solution', async () => {
    const with_hint = { ...PRACTICE_SET, problems: [{ ...PROBLEM, hints: ['Divide.'] }] };
    learning_service.show_practice_hint.mockResolvedValue(with_hint);
    learning_service.show_practice_solution.mockResolvedValue({
      ...PRACTICE_SET,
      problems: [{ ...PROBLEM, is_solution_shown: true, solution_steps: ['4 / 2 = 2'], answer: '2' }],
    });
    const on_changed = vi.fn();
    const { rerender } = render(<PracticeView practice_set={PRACTICE_SET} on_changed={on_changed} />);

    expect(screen.getByRole('heading', { name: 'Worked example' })).toBeInTheDocument();
    expect(screen.getByText('Answer: x = 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show a hint' }));
    expect(learning_service.show_practice_hint).toHaveBeenCalledWith('p1', 0);
    expect(on_changed).toHaveBeenCalledWith(with_hint);

    rerender(<PracticeView practice_set={with_hint} on_changed={on_changed} />);
    expect(screen.getByText('Hints (1 of 3)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show another hint' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show the solution' }));
    rerender(<PracticeView practice_set={on_changed.mock.calls[1][0]} on_changed={on_changed} />);
    expect(screen.getByText('4 / 2 = 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show the solution' })).not.toBeInTheDocument();
  });

  it('checks an answer, clears the box, and shows feedback and errors', async () => {
    const attempt = { answer: '3', is_correct: false, feedback: 'Divide both sides.' };
    learning_service.check_practice_answer
      .mockResolvedValueOnce({ practice_set: { ...PRACTICE_SET, problems: [{ ...PROBLEM, attempts: [attempt] }] }, attempt })
      .mockRejectedValueOnce(new Error('The AI is busy right now'));
    const on_changed = vi.fn();
    const { rerender } = render(<PracticeView practice_set={PRACTICE_SET} on_changed={on_changed} />);

    expect(screen.getByRole('button', { name: 'Check my answer' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Your answer'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
    expect(learning_service.check_practice_answer).toHaveBeenCalledWith('p1', 0, '3');
    expect(screen.getByLabelText('Your answer')).toHaveValue('');

    rerender(<PracticeView practice_set={on_changed.mock.calls[0][0]} on_changed={on_changed} />);
    expect(screen.getByText('Divide both sides.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Your answer'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now');
    expect(screen.getByLabelText('Your answer')).toHaveValue('2');
  });

  it('marks a solved problem and hides its answer box', () => {
    const solved = { ...PROBLEM, is_solved: true, attempts: [{ answer: '2', is_correct: true, feedback: 'Well done.' }] };
    render(<PracticeView practice_set={{ ...PRACTICE_SET, problems: [solved], solved_count: 1 }} on_changed={vi.fn()} />);
    expect(screen.getByText('Solved')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
    expect(screen.getByText(/1 of 1 solved/)).toBeInTheDocument();
  });
});

describe('ReadingList', () => {
  it('describes how far through a resource the student is', () => {
    expect(describe_reading_progress({ section_count: 1, position: 0 })).toBe('1 section');
    expect(describe_reading_progress({ section_count: 12, position: 2 })).toBe('Up to section 3 of 12');
  });

  it('lists readable resources with start or continue buttons', async () => {
    learning_service.fetch_reading_list.mockResolvedValue([
      { resource_id: 'r1', title: 'Week 1', resource_type: 'pdf', section_count: 4, position: 0 },
      { resource_id: 'r2', title: 'Week 2', resource_type: 'note', section_count: 4, position: 2 },
      { resource_id: 'r3', title: 'Empty', resource_type: 'note', section_count: 0, position: 0 },
    ]);
    const on_open = vi.fn();
    render_in_router(<ReadingList skill={SKILL} on_open={on_open} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Continue reading Week 2' }));
    expect(on_open).toHaveBeenCalledWith('r2');
    expect(screen.getByRole('button', { name: 'Start reading Week 1' })).toBeInTheDocument();
    expect(screen.queryByText('Empty')).not.toBeInTheDocument();
  });

  it('points to the skill map when there is nothing to read, and shows errors', async () => {
    learning_service.fetch_reading_list.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Offline'));
    const { unmount } = render_in_router(<ReadingList skill={SKILL} on_open={vi.fn()} />);
    expect(await screen.findByRole('link', { name: 'skill map' })).toHaveAttribute('href', '/dashboard/skill-map?skill=s1');
    unmount();
    render_in_router(<ReadingList skill={SKILL} on_open={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  });
});

describe('ReadingView', () => {
  const OVERVIEW = {
    resource: { id: 'r1', skill_id: 's1', topic_id: null, title: 'Week 1', resource_type: 'note' },
    sections: [
      { index: 0, title: 'Cells', character_count: 20, has_guide: true },
      { index: 1, title: 'Energy', character_count: 20, has_guide: false },
    ],
    position: 1,
  };

  function mock_sections() {
    learning_service.fetch_reading_section.mockImplementation(async (resource_id, section_index) => ({
      index: section_index,
      title: OVERVIEW.sections[section_index].title,
      text: `Text of section ${section_index}.\n\nSecond paragraph.`,
      guide: null,
    }));
    learning_service.guide_reading_section.mockImplementation(async (resource_id, section_index) => ({
      index: section_index,
      guide: { explanation_markdown: `Guide ${section_index}`, think_about: `Question ${section_index}` },
    }));
  }

  it('reads only a selection inside the text', () => {
    const container = document.createElement('div');
    const inside = document.createTextNode('inside');
    container.append(inside);
    expect(read_selected_passage(container, { rangeCount: 1, anchorNode: inside, toString: () => '  words  ' })).toBe('words');
    expect(read_selected_passage(container, { rangeCount: 1, anchorNode: document.body, toString: () => 'x' })).toBe('');
    expect(read_selected_passage(container, { rangeCount: 0 })).toBe('');
    expect(read_selected_passage(null, null)).toBe('');
  });

  it('opens where the student left off, with the guide, and saves the place when moving', async () => {
    learning_service.fetch_reading.mockResolvedValue(OVERVIEW);
    learning_service.save_reading_position.mockResolvedValue({ position: 0 });
    mock_sections();
    render(<ReadingView resource_id="r1" />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Energy' })).toBeInTheDocument();
    expect(await screen.findByText('Guide 1')).toBeInTheDocument();
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next section/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Previous section/ }));
    expect(learning_service.save_reading_position).toHaveBeenCalledWith('r1', 0);
    expect(await screen.findByRole('heading', { level: 2, name: 'Cells' })).toHaveFocus();
    await userEvent.selectOptions(screen.getByLabelText('Go to section'), '1');
    expect(learning_service.save_reading_position).toHaveBeenLastCalledWith('r1', 1);
  });

  it('explains a typed passage and says when the place was not saved', async () => {
    learning_service.fetch_reading.mockResolvedValue({ ...OVERVIEW, position: 0 });
    learning_service.explain_reading_passage.mockResolvedValue({ explanation_markdown: 'It means **cells**.' });
    learning_service.save_reading_position.mockRejectedValue(new Error('Offline'));
    mock_sections();
    render(<ReadingView resource_id="r1" />);

    await userEvent.type(await screen.findByLabelText('Stuck on something?'), 'section 0');
    await userEvent.click(screen.getByRole('button', { name: 'Explain this' }));
    expect(learning_service.explain_reading_passage).toHaveBeenCalledWith('r1', 0, 'section 0');
    expect(await screen.findByText('cells')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Next section/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Your place wasn't saved: Offline");
  });

  it('handles a resource with no text, and loading errors', async () => {
    learning_service.fetch_reading.mockResolvedValueOnce({ ...OVERVIEW, sections: [] }).mockRejectedValueOnce(new Error('Resource not found'));
    const { unmount } = render(<ReadingView resource_id="r1" />);
    expect(await screen.findByText('This resource has no text to read.')).toBeInTheDocument();
    unmount();
    render(<ReadingView resource_id="r2" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Resource not found');
  });

  it('shows a guide error', async () => {
    learning_service.fetch_reading.mockResolvedValue({ ...OVERVIEW, position: 0 });
    mock_sections();
    learning_service.guide_reading_section.mockRejectedValue(new Error('The AI is busy right now'));
    render(<ReadingView resource_id="r1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now');
  });
});

describe('GlossaryPanel', () => {
  const TERMS = [
    { id: 'g1', term: 'Nucleus', definition: 'Holds DNA.', topic_id: 't1' },
    { id: 'g2', term: 'Osmosis', definition: 'Water moving.', topic_id: null },
  ];

  it('filters, describes and orders terms', () => {
    expect(filter_glossary_terms(TERMS, ' water ')).toEqual([TERMS[1]]);
    expect(filter_glossary_terms(TERMS, '')).toBe(TERMS);
    expect(describe_added_terms(0)).toMatch('No new key terms');
    expect(describe_added_terms(1)).toBe('Added 1 new key term.');
    expect(describe_added_terms(4)).toBe('Added 4 new key terms.');
    expect(insert_term_in_order(TERMS, { term: 'enzyme' }).map((glossary_term) => glossary_term.term)).toEqual(['enzyme', 'Nucleus', 'Osmosis']);
  });

  it('lists terms with their topic, searches and deletes', async () => {
    learning_service.fetch_glossary.mockResolvedValue(TERMS);
    learning_service.delete_glossary_term.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GlossaryPanel skill={SKILL} />);

    expect(await screen.findByText('Holds DNA.')).toBeInTheDocument();
    expect(await screen.findByText('Topic: Cells')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search key terms'), 'zzz');
    expect(screen.getByText('No terms match "zzz".')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Search key terms'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Osmosis' }));
    expect(learning_service.delete_glossary_term).toHaveBeenCalledWith('s1', 'g2');
    await waitFor(() => expect(screen.queryByText('Water moving.')).not.toBeInTheDocument());
  });

  it('finds key terms with the AI, and shows errors', async () => {
    learning_service.fetch_glossary.mockResolvedValue([]);
    learning_service.generate_glossary
      .mockResolvedValueOnce({ added_count: 2, terms: TERMS })
      .mockRejectedValueOnce(new Error('The AI is busy right now'));
    render(<GlossaryPanel skill={SKILL} />);

    expect(await screen.findByText(/No key terms yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Find key terms' }));
    expect(await screen.findByText('Added 2 new key terms.')).toBeInTheDocument();
    expect(screen.getByText('Holds DNA.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Find key terms' }));
    expect(await screen.findByText('The AI is busy right now')).toBeInTheDocument();
  });

  it('adds a term by hand, with its topic, and shows field errors', async () => {
    learning_service.fetch_glossary.mockResolvedValue([]);
    learning_service.add_glossary_term
      .mockRejectedValueOnce(Object.assign(new Error('Please fix the highlighted fields'), { field_errors: { definition: 'Definition is required' } }))
      .mockResolvedValueOnce({ id: 'g3', term: 'Enzyme', definition: 'A helper.', topic_id: 't2' });
    render(<GlossaryPanel skill={SKILL} />);

    await userEvent.click(await screen.findByText('Add a term yourself'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Term' }), 'Enzyme');
    await userEvent.click(screen.getByRole('button', { name: 'Add term' }));
    expect(await screen.findByText('Definition is required')).toBeInTheDocument();
    expect(learning_service.add_glossary_term).toHaveBeenLastCalledWith('s1', { term: 'Enzyme', definition: '' });

    await userEvent.type(screen.getByLabelText('Definition'), 'A helper.');
    await waitFor(() => expect(screen.getByLabelText('Topic (optional)')).toHaveTextContent('Mitosis'));
    await userEvent.selectOptions(screen.getByLabelText('Topic (optional)'), 't2');
    await userEvent.click(screen.getByRole('button', { name: 'Add term' }));
    expect(learning_service.add_glossary_term).toHaveBeenLastCalledWith('s1', { term: 'Enzyme', definition: 'A helper.', topic_id: 't2' });
    expect(await screen.findByText('Added "Enzyme".')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Term' })).toHaveValue('');
  });
});

describe('LearningPathPanel', () => {
  const STEPS = [
    { topic_id: 't1', topic: 'Cells', summary: 'Small.', parent_topic: '', reason: 'Start here.', is_new: false, mastery_level: 'strong', lesson: null, status: 'done' },
    {
      topic_id: 't2',
      topic: 'Mitosis',
      summary: 'Dividing.',
      parent_topic: 'Cells',
      reason: '',
      is_new: false,
      mastery_level: 'untested',
      lesson: { latest_lesson_id: 'l2', is_latest_complete: false, has_finished: false },
      status: 'next',
    },
    { topic_id: 't3', topic: 'Genes', summary: '', parent_topic: '', reason: '', is_new: true, mastery_level: 'untested', lesson: null, status: 'todo' },
  ];
  const PATH = { has_path: true, created_at: '2026-10-24', steps: STEPS, new_topic_count: 1, topic_count: 3 };

  it('counts, labels and explains the path', () => {
    expect(count_done_steps(STEPS)).toBe(1);
    expect(PATH_STATUS_DETAILS.next.label).toBe('Next up');
    expect(get_lesson_action(STEPS[1])).toEqual({ label: 'Continue lesson', lesson_id: 'l2' });
    expect(get_lesson_action(STEPS[2])).toEqual({ label: 'Start lesson', lesson_id: null });
    expect(get_lesson_action({ lesson: { is_latest_complete: true, has_finished: true } })).toEqual({ label: 'Learn it again', lesson_id: null });
    expect(describe_new_topics(0)).toBe('');
    expect(describe_new_topics(1)).toMatch("1 new topic was added since this path was made, so it's at the end");
    expect(describe_new_topics(2)).toMatch("2 new topics were added since this path was made, so they're at the end");
  });

  it('offers to build a path, noting when topics will be found first', async () => {
    learning_service.fetch_learning_path.mockResolvedValue({ has_path: false, created_at: null, steps: [], new_topic_count: 0, topic_count: 0 });
    learning_service.build_learning_path.mockResolvedValueOnce(PATH);
    render_in_router(<LearningPathPanel skill={SKILL} on_lesson_started={vi.fn()} on_open_lesson={vi.fn()} />);

    expect(await screen.findByText(/no topics yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Build my learning path' }));
    expect(await screen.findByText(/1 of 3 topics done/)).toBeInTheDocument();
  });

  it('shows each step with its status and ways to learn it', async () => {
    learning_service.fetch_learning_path.mockResolvedValue(PATH);
    learning_service.start_guided_lesson.mockResolvedValueOnce(LESSON).mockRejectedValueOnce(new Error('The AI is busy right now'));
    const on_lesson_started = vi.fn();
    const on_open_lesson = vi.fn();
    render_in_router(<LearningPathPanel skill={SKILL} on_lesson_started={on_lesson_started} on_open_lesson={on_open_lesson} />);

    const steps = await screen.findAllByRole('listitem');
    expect(within(steps[0]).getByText('Done')).toBeInTheDocument();
    expect(within(steps[0]).getByText('Start here.')).toBeInTheDocument();
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(within(steps[1]).getByText('Part of Cells')).toBeInTheDocument();
    expect(within(steps[2]).getByText('(new)')).toBeInTheDocument();
    expect(screen.getByText(/1 new topic was added/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practise Genes' })).toHaveAttribute('href', '/dashboard/learn?skill=s1&tab=practice&topic=t3');
    expect(screen.getByRole('link', { name: 'Quiz me on Genes' })).toHaveAttribute('href', '/dashboard/quiz?skill=s1&topic=t3');

    await userEvent.click(screen.getByRole('button', { name: 'Continue lesson: Mitosis' }));
    expect(on_open_lesson).toHaveBeenCalledWith('l2');
    await userEvent.click(screen.getByRole('button', { name: 'Start lesson: Genes' }));
    expect(learning_service.start_guided_lesson).toHaveBeenCalledWith('s1', { topic_id: 't3', step_count: 4 });
    expect(on_lesson_started).toHaveBeenCalledWith(LESSON);
    await userEvent.click(screen.getByRole('button', { name: 'Start lesson: Genes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now');
  });

  it('reorders the path, shows build errors and an empty path', async () => {
    learning_service.fetch_learning_path.mockResolvedValue({ ...PATH, steps: [], new_topic_count: 0 });
    learning_service.build_learning_path.mockRejectedValue(new Error('The AI is busy right now'));
    render_in_router(<LearningPathPanel skill={SKILL} on_lesson_started={vi.fn()} on_open_lesson={vi.fn()} />);

    expect(await screen.findByText(/There are no topics on the path/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reorder my path' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now');
  });

  it('shows loading errors', async () => {
    learning_service.fetch_learning_path.mockRejectedValue(new Error('Offline'));
    render_in_router(<LearningPathPanel skill={SKILL} on_lesson_started={vi.fn()} on_open_lesson={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  });
});

describe('TopicKeyTerms', () => {
  it("shows the topic's terms, or a link to find some", async () => {
    learning_service.fetch_glossary.mockResolvedValue([
      { id: 'g1', term: 'Nucleus', definition: 'Holds DNA.', topic_id: 't1' },
      { id: 'g2', term: 'Osmosis', definition: 'Water moving.', topic_id: 't2' },
    ]);
    const { unmount } = render_in_router(<TopicKeyTerms skill_id="s1" topic_id="t1" Heading="h3" />);
    expect(await screen.findByText('Holds DNA.')).toBeInTheDocument();
    expect(screen.queryByText('Water moving.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All key terms' })).toHaveAttribute('href', '/dashboard/learn?skill=s1&tab=terms');
    unmount();

    render_in_router(<TopicKeyTerms skill_id="s1" topic_id="t9" Heading="h4" />);
    expect(await screen.findByRole('link', { name: 'Find key terms' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Key terms' })).toBeInTheDocument();
  });
});
