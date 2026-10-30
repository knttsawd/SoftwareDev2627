import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STATUS } from '../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from './helpers/render_helpers.jsx';
import { TEST_ACCOUNT } from './helpers/test_data.js';

vi.mock('../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue('response') }));
vi.mock('../src/services/skill_service.js', () => ({ fetch_skills: vi.fn() }));
vi.mock('../src/services/topic_service.js', () => ({ fetch_topic_map: vi.fn() }));
vi.mock('../src/services/resource_service.js', () => ({ fetch_resources: vi.fn() }));
vi.mock('../src/services/teach_service.js', () => ({ fetch_teach_sessions: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/services/study_material_service.js', async (import_original) => ({
  ...(await import_original()),
  generate_quiz: vi.fn(),
  fetch_quiz: vi.fn(),
  check_answer: vi.fn(),
  submit_quiz_answers: vi.fn(),
  fetch_recent_results: vi.fn(),
}));

const { send_authed_request } = await import('../src/services/auth_service.js');
const { fetch_skills } = await import('../src/services/skill_service.js');
const { fetch_topic_map } = await import('../src/services/topic_service.js');
const { fetch_resources } = await import('../src/services/resource_service.js');
const study_material_service = await import('../src/services/study_material_service.js');
const {
  build_quiz_details,
  CUSTOM_TOPIC_CHOICE,
  get_initial_choice,
  is_available_choice,
  resource_choice,
  topic_choice,
  WHOLE_SKILL_CHOICE,
  default: QuizSetup,
} = await import('../src/components/quiz/QuizSetup.jsx');
const { count_unanswered, default: QuizRunner } = await import('../src/components/quiz/QuizRunner.jsx');
const { describe_choice, get_question_outcome, default: QuizResults } = await import('../src/components/quiz/QuizResults.jsx');
const { build_retake_details, default: QuizWorkspace } = await import('../src/components/quiz/QuizWorkspace.jsx');
const { default: RecentResults } = await import('../src/components/quiz/RecentResults.jsx');
const { default: QuizPage } = await import('../src/pages/dashboard/QuizPage.jsx');

const SKILLS = [
  { id: 's1', name: 'Biology', resource_count: 1 },
  { id: 's2', name: 'Spanish', resource_count: 0 },
];
const TOPICS = [{ id: 't1', topic: 'Cells', mastery_score: null, mastery_level: 'untested' }];
const RESOURCES = [{ id: 'r1', title: 'Week 3 notes', resource_type: 'note', topic_id: null }];
const QUIZ = {
  id: 'q1',
  skill_id: 's1',
  topic_id: 't1',
  topic: 'Cells',
  questions: [
    { question: 'What holds DNA?', choices: ['Nucleus', 'Wall', 'Ribosome', 'Vacuole'] },
    { question: 'What makes energy?', choices: ['Mitochondria', 'Nucleus', 'Wall', 'Vacuole'] },
  ],
};
const GRADED = {
  result: { id: 'r1', score: 50, correct_count: 1, total_count: 2 },
  question_results: [
    { question: 'What holds DNA?', choices: QUIZ.questions[0].choices, chosen_index: 0, correct_index: 0, is_correct: true, explanation: 'The nucleus stores DNA.' },
    { question: 'What makes energy?', choices: QUIZ.questions[1].choices, chosen_index: null, correct_index: 0, is_correct: false, explanation: '' },
  ],
  topic: { id: 't1', topic: 'Cells', mastery_score: 50, mastery_level: 'developing' },
};

beforeEach(() => {
  vi.clearAllMocks();
  fetch_skills.mockResolvedValue(SKILLS);
  fetch_topic_map.mockResolvedValue({ topics: TOPICS, suggestions: [] });
  fetch_resources.mockResolvedValue(RESOURCES);
  study_material_service.fetch_recent_results.mockResolvedValue([]);
});

describe('quiz service calls', () => {
  it('check, submit and load results through the right endpoints', async () => {
    const real_service = await vi.importActual('../src/services/study_material_service.js');

    await real_service.check_answer('q1', 0, 2);
    await real_service.submit_quiz_answers('q1', [0, null]);
    await real_service.fetch_recent_results('s1');

    expect(send_authed_request.mock.calls).toEqual([
      ['/quizzes/q1/check', { method: 'POST', body: { question_index: 0, answer_index: 2 } }],
      ['/quizzes/q1/results', { method: 'POST', body: { answers: [0, null] } }],
      ['/skills/s1/results'],
    ]);
  });
});

describe('QuizSetup', () => {
  it('encodes and checks the choices', () => {
    expect(topic_choice('t1')).toBe('topic:t1');
    expect(resource_choice('r1')).toBe('resource:r1');
    expect(get_initial_choice('t1', null)).toBe('topic:t1');
    expect(get_initial_choice('t1', 'r1')).toBe('resource:r1');
    expect(get_initial_choice(null, null)).toBe('');
    expect(is_available_choice('topic:t1', TOPICS, RESOURCES)).toBe(true);
    expect(is_available_choice('resource:r1', TOPICS, RESOURCES)).toBe(true);
    expect(is_available_choice(WHOLE_SKILL_CHOICE, [], [])).toBe(true);
    expect(is_available_choice('topic:gone', TOPICS, RESOURCES)).toBe(false);
  });

  it('builds quiz details for each kind of choice', () => {
    expect(build_quiz_details('topic:t1', '', 5)).toEqual({ scope: 'topic', topic_id: 't1', question_count: 5 });
    expect(build_quiz_details(CUSTOM_TOPIC_CHOICE, 'Osmosis', 3)).toEqual({ scope: 'topic', topic: 'Osmosis', question_count: 3 });
    expect(build_quiz_details('resource:r1', '', 4)).toEqual({ scope: 'resource', resource_id: 'r1', question_count: 4 });
    expect(build_quiz_details(WHOLE_SKILL_CHOICE, '', 6)).toEqual({ scope: 'skill', question_count: 6 });
  });

  it('starts on the first topic of the first skill once it loads', async () => {
    render_in_router(<QuizSetup on_quiz_ready={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('What to quiz on')).toHaveValue('topic:t1'));
  });

  it('starts a quiz on the preselected map topic', async () => {
    study_material_service.generate_quiz.mockResolvedValue(QUIZ);
    const on_quiz_ready = vi.fn();
    render_in_router(<QuizSetup initial_skill_id="s1" initial_topic_id="t1" on_quiz_ready={on_quiz_ready} />);

    await screen.findByRole('option', { name: 'Cells (Not tested)' });
    await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }));

    expect(study_material_service.generate_quiz).toHaveBeenCalledWith('s1', { scope: 'topic', topic_id: 't1', question_count: 5 });
    expect(on_quiz_ready).toHaveBeenCalledWith(QUIZ);
  });

  it('offers the whole skill, each topic and each resource', async () => {
    study_material_service.generate_quiz.mockResolvedValue(QUIZ);
    render_in_router(<QuizSetup initial_skill_id="s1" initial_resource_id="r1" on_quiz_ready={vi.fn()} />);

    expect(await screen.findByRole('option', { name: 'Week 3 notes' })).toBeInTheDocument();
    expect(screen.getByLabelText('What to quiz on')).toHaveValue('resource:r1');
    await userEvent.selectOptions(screen.getByLabelText('What to quiz on'), 'Everything in Biology');
    await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }));

    expect(study_material_service.generate_quiz).toHaveBeenCalledWith('s1', { scope: 'skill', question_count: 5 });
  });

  it('lets the student type a topic, and starts on the whole skill when there are no topics', async () => {
    fetch_topic_map.mockResolvedValue({ topics: [], suggestions: [] });
    study_material_service.generate_quiz.mockResolvedValue(QUIZ);
    render_in_router(<QuizSetup initial_skill_id="s1" on_quiz_ready={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('What to quiz on')).toHaveValue(WHOLE_SKILL_CHOICE));
    await userEvent.selectOptions(screen.getByLabelText('What to quiz on'), 'Type my own topic…');
    await userEvent.type(screen.getByLabelText('Your topic'), 'Osmosis');
    await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }));

    expect(study_material_service.generate_quiz).toHaveBeenCalledWith('s1', { scope: 'topic', topic: 'Osmosis', question_count: 5 });
  });

  it('allows a quiz on a skill without resources, explaining where the questions come from', async () => {
    fetch_resources.mockResolvedValue([]);
    render_in_router(<QuizSetup initial_skill_id="s2" on_quiz_ready={vi.fn()} />);

    expect(await screen.findByText(/Spanish has no resources yet/)).toHaveTextContent("the AI's general knowledge");
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start quiz' })).toBeEnabled());
  });

  it('points to the skill map when there are no skills', async () => {
    fetch_skills.mockResolvedValue([]);
    render_in_router(<QuizSetup on_quiz_ready={vi.fn()} />);

    expect(await screen.findByRole('link', { name: 'skill map' })).toHaveAttribute('href', '/dashboard/skill-map');
  });

  it('shows errors from making the quiz', async () => {
    study_material_service.generate_quiz.mockRejectedValue(new Error('The AI is busy right now.'));
    render_in_router(<QuizSetup initial_skill_id="s1" initial_topic_id="t1" on_quiz_ready={vi.fn()} />);

    await screen.findByRole('option', { name: 'Cells (Not tested)' });
    await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now.');
  });
});

describe('QuizRunner', () => {
  it('counts unanswered questions', () => {
    expect(count_unanswered([0, null, null])).toBe(2);
  });

  it('moves through questions and submits every answer at the end', async () => {
    study_material_service.submit_quiz_answers.mockResolvedValue(GRADED);
    const on_graded = vi.fn();
    render(<QuizRunner quiz={QUIZ} feedback_timing="at_end" on_graded={on_graded} />);

    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'A. Nucleus' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('radio', { name: 'A. Nucleus' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }));
    await userEvent.click(screen.getByRole('radio', { name: 'A. Mitochondria' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish quiz' }));

    expect(study_material_service.submit_quiz_answers).toHaveBeenCalledWith('q1', [0, 0]);
    expect(on_graded).toHaveBeenCalledWith(GRADED);
  });

  it('asks before finishing with skipped questions', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<QuizRunner quiz={QUIZ} feedback_timing="at_end" on_graded={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish quiz' }));

    expect(window.confirm).toHaveBeenCalledWith('You skipped 2 question(s). Skipped questions count as wrong.');
    expect(study_material_service.submit_quiz_answers).not.toHaveBeenCalled();
  });

  it('checks each answer straight away when the student prefers that, then locks it', async () => {
    study_material_service.check_answer.mockResolvedValue({ is_correct: false, correct_index: 0, explanation: 'The nucleus stores DNA.' });
    render(<QuizRunner quiz={QUIZ} feedback_timing="after_each" on_graded={vi.fn()} />);

    await userEvent.click(screen.getByRole('radio', { name: 'B. Wall' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check answer' }));

    expect(study_material_service.check_answer).toHaveBeenCalledWith('q1', 0, 1);
    expect(await screen.findByRole('status')).toHaveTextContent('Not quite. The answer is A: Nucleus');
    expect(screen.getByRole('radio', { name: 'B. Wall' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next question' })).toBeInTheDocument();
  });

  it('shows grading errors', async () => {
    study_material_service.submit_quiz_answers.mockRejectedValue(new Error('Server down'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<QuizRunner quiz={{ ...QUIZ, questions: [QUIZ.questions[0]] }} feedback_timing="at_end" on_graded={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Finish quiz' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
  });
});

describe('QuizResults', () => {
  it('describes outcomes and choices', () => {
    expect(get_question_outcome(GRADED.question_results[0])).toBe('correct');
    expect(get_question_outcome(GRADED.question_results[1])).toBe('skipped');
    expect(get_question_outcome({ chosen_index: 1, is_correct: false })).toBe('incorrect');
    expect(describe_choice(GRADED.question_results[0], 0)).toBe('A. Nucleus');
    expect(describe_choice(GRADED.question_results[0], null)).toBe('No answer');
  });

  it('shows the score, the topic update and a review of each question', async () => {
    const on_retake = vi.fn();
    render_in_router(<QuizResults quiz={QUIZ} graded={GRADED} on_retake={on_retake} />);

    expect(screen.getByRole('heading', { name: 'You scored 50%' })).toBeInTheDocument();
    expect(screen.getByText(/on your skill map is now Developing · 50%/)).toBeInTheDocument();
    expect(screen.getByText('Question 1: Correct')).toBeInTheDocument();
    expect(screen.getByText('Question 2: Skipped')).toBeInTheDocument();
    expect(screen.getByText('Right answer: A. Mitochondria')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the skill map' })).toHaveAttribute('href', '/dashboard/skill-map?skill=s1');

    await userEvent.click(screen.getByRole('button', { name: 'New quiz on this topic' }));
    expect(on_retake).toHaveBeenCalled();
  });
});

describe('QuizWorkspace', () => {
  it('retakes a quiz on the same thing it covered', () => {
    const questions = QUIZ.questions;

    expect(build_retake_details({ scope: 'skill', questions })).toEqual({ scope: 'skill', question_count: 2 });
    expect(build_retake_details({ scope: 'resource', resource_id: 'r1', questions })).toEqual({
      scope: 'resource',
      resource_id: 'r1',
      question_count: 2,
    });
    expect(build_retake_details({ scope: 'resource', resource_id: null, topic: 'Old notes', questions })).toEqual({
      scope: 'topic',
      topic: 'Old notes',
      question_count: 2,
    });
    expect(build_retake_details({ scope: 'topic', topic_id: null, topic: 'Osmosis', questions })).toEqual({
      scope: 'topic',
      topic: 'Osmosis',
      question_count: 2,
    });
  });

  it('opens an existing quiz straight away, grades it, and retakes on the same topic', async () => {
    study_material_service.fetch_quiz.mockResolvedValue(QUIZ);
    study_material_service.submit_quiz_answers.mockResolvedValue(GRADED);
    study_material_service.generate_quiz.mockResolvedValue({ ...QUIZ, id: 'q2' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const on_finished = vi.fn();
    render_in_router(<QuizWorkspace initial_quiz_id="q1" feedback_timing="at_end" on_finished={on_finished} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish quiz' }));
    expect(await screen.findByRole('heading', { name: 'You scored 50%' })).toBeInTheDocument();
    expect(on_finished).toHaveBeenCalledWith(GRADED, QUIZ);

    await userEvent.click(screen.getByRole('button', { name: 'New quiz on this topic' }));
    expect(study_material_service.generate_quiz).toHaveBeenCalledWith('s1', { scope: 'topic', topic_id: 't1', question_count: 2 });
    expect(await screen.findByText('Question 1 of 2')).toBeInTheDocument();
  });

  it('shows the setup form without a quiz, and errors for a quiz that cannot load', async () => {
    render_in_router(<QuizWorkspace feedback_timing="at_end" />);
    expect(await screen.findByRole('button', { name: 'Start quiz' })).toBeInTheDocument();

    study_material_service.fetch_quiz.mockRejectedValue(new Error('Quiz not found'));
    render_in_router(<QuizWorkspace initial_quiz_id="missing" feedback_timing="at_end" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Quiz not found');
  });
});

describe('RecentResults', () => {
  it('lists results with scores', async () => {
    study_material_service.fetch_recent_results.mockResolvedValue([
      { id: 'r1', topic: 'Cells', score: 67, correct_count: 2, total_count: 3, completed_at: '2026-10-24T12:00:00.000Z' },
    ]);
    render(<RecentResults skill_id="s1" refresh_key={0} />);

    expect(await screen.findByRole('progressbar', { name: 'Cells: 67%' })).toBeInTheDocument();
    expect(screen.getByText('(2/3)')).toBeInTheDocument();
  });

  it('says when there are no results', async () => {
    render(<RecentResults skill_id="s1" refresh_key={0} />);

    expect(await screen.findByText('No quiz results yet.')).toBeInTheDocument();
  });
});

describe('QuizPage', () => {
  it('sets up a quiz for the topic in the address, with the AI student lessons and results', async () => {
    render_in_router(<QuizPage />, {
      initial_path: '/dashboard/quiz?skill=s1&topic=t1',
      auth_value: create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT }),
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Quiz' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Cells (Not tested)' })).toBeInTheDocument();
    expect(screen.getByLabelText('What to quiz on')).toHaveValue('topic:t1');
    expect(screen.getByRole('heading', { name: "AI student's quiz" })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Start a lesson' })).toHaveAttribute('href', '/dashboard/teach');
    await waitFor(() => expect(study_material_service.fetch_recent_results).toHaveBeenCalledWith('s1'));
  });

  it('shows and refreshes the recent results for the skill of a quiz just graded', async () => {
    study_material_service.fetch_quiz.mockResolvedValue(QUIZ);
    study_material_service.submit_quiz_answers.mockResolvedValue(GRADED);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render_in_router(<QuizPage />, {
      initial_path: '/dashboard/quiz?quiz=q1',
      auth_value: create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT }),
    });

    expect(screen.queryByRole('heading', { name: 'Recent results' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish quiz' }));

    expect(await screen.findByRole('heading', { name: 'Recent results' })).toBeInTheDocument();
    await waitFor(() => expect(study_material_service.fetch_recent_results).toHaveBeenCalledWith('s1'));
  });

  it('sets up a quiz on the resource in the address', async () => {
    render_in_router(<QuizPage />, {
      initial_path: '/dashboard/quiz?skill=s1&resource=r1',
      auth_value: create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT }),
    });

    await screen.findByRole('option', { name: 'Week 3 notes' });
    expect(screen.getByLabelText('What to quiz on')).toHaveValue('resource:r1');
  });
});
