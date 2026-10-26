import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STATUS } from '../src/context/AuthContext.jsx';
import { create_auth_value, render_in_router } from './helpers/render_helpers.jsx';
import { TEST_ACCOUNT } from './helpers/test_data.js';

vi.mock('../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue('response') }));
vi.mock('../src/services/skill_service.js', () => ({ fetch_skills: vi.fn() }));
vi.mock('../src/services/topic_service.js', () => ({ fetch_topic_map: vi.fn() }));
vi.mock('../src/services/teach_service.js', async (import_original) => ({
  ...(await import_original()),
  fetch_teach_sessions: vi.fn(),
  start_teach_session: vi.fn(),
  fetch_teach_session: vi.fn(),
  send_teaching_message: vi.fn(),
  start_lesson_quiz: vi.fn(),
  submit_lesson_answers: vi.fn(),
  delete_teach_session: vi.fn(),
}));

const { send_authed_request } = await import('../src/services/auth_service.js');
const { fetch_skills } = await import('../src/services/skill_service.js');
const { fetch_topic_map } = await import('../src/services/topic_service.js');
const teach_service = await import('../src/services/teach_service.js');
const { default: ScoreCard } = await import('../src/components/teach/ScoreCard.jsx');
const { describe_lesson_status, default: LessonHistory } = await import('../src/components/teach/LessonHistory.jsx');
const { build_lesson_details, CUSTOM_LESSON_TOPIC, default: TeachSetup } = await import('../src/components/teach/TeachSetup.jsx');
const { to_chat_messages, default: TeachLesson } = await import('../src/components/teach/TeachLesson.jsx');
const { default: TeachQuiz } = await import('../src/components/teach/TeachQuiz.jsx');
const { describe_answer_outcome, default: TeachResults } = await import('../src/components/teach/TeachResults.jsx');
const { default: AiStudentResults } = await import('../src/components/teach/AiStudentResults.jsx');
const { build_repeat_lesson_details, default: TeachPage } = await import('../src/pages/dashboard/TeachPage.jsx');

const SKILLS = [{ id: 's1', name: 'Biology', resource_count: 1 }];
const TOPICS = [
  { id: 't1', topic: 'Cells', parent_node_id: null, mastery_score: null, mastery_level: 'untested' },
  { id: 't2', topic: 'Mitosis', parent_node_id: 't1', mastery_score: null, mastery_level: 'untested' },
];
const GREETING = { role: 'ai_student', content: "Hi! I'm Pip." };
const TEACHING_SESSION = {
  id: 'l1',
  skill_id: 's1',
  topic_id: 't1',
  topic: 'Cells',
  status: 'teaching',
  lesson_messages: [GREETING],
  teacher_message_count: 0,
  max_teacher_messages: 15,
  quiz: null,
  results: null,
};
const QUIZ = {
  id: 'q1',
  skill_id: 's1',
  topic: 'Cells',
  questions: [{ question: 'What holds DNA?', choices: ['Nucleus', 'Wall', 'Ribosome', 'Vacuole'] }],
};
const QUIZ_SESSION = { ...TEACHING_SESSION, status: 'quiz', teacher_message_count: 1, quiz: QUIZ };
const DONE_SESSION = {
  ...QUIZ_SESSION,
  status: 'done',
  quiz: null,
  results: {
    combined_score: 50,
    student: { score: 100, correct_count: 1, total_count: 1 },
    ai_student: { score: 0, correct_count: 0, total_count: 1 },
    teaching_feedback: 'Tell me more about the nucleus.',
    review: [
      {
        question: 'What holds DNA?',
        choices: QUIZ.questions[0].choices,
        correct_index: 0,
        explanation: 'The nucleus stores DNA.',
        student_choice: 0,
        student_is_correct: true,
        ai_student_choice: null,
        ai_student_is_correct: false,
        ai_student_reason: "You didn't teach me that.",
      },
    ],
  },
};
const LESSON_SUMMARY = { skill_id: 's1', skill_name: 'Biology', created_at: '2026-10-24T12:00:00.000Z' };
const LESSONS = [
  { ...LESSON_SUMMARY, id: 'l1', topic: 'Cells', status: 'done', combined_score: 50, student_score: 100, ai_student_score: 0 },
  { ...LESSON_SUMMARY, id: 'l2', topic: 'Mitosis', status: 'teaching', combined_score: null, student_score: null, ai_student_score: null },
];
const SIGNED_IN = create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT });

beforeEach(() => {
  vi.clearAllMocks();
  fetch_skills.mockResolvedValue(SKILLS);
  fetch_topic_map.mockResolvedValue({ topics: TOPICS, suggestions: [] });
  teach_service.fetch_teach_sessions.mockResolvedValue([]);
});

describe('teach service', () => {
  it('calls the lesson endpoints', async () => {
    const real_service = await vi.importActual('../src/services/teach_service.js');

    await real_service.fetch_teach_sessions('s1');
    await real_service.fetch_teach_sessions();
    await real_service.start_teach_session('s1', { topic_id: 't1' });
    await real_service.fetch_teach_session('l1');
    await real_service.send_teaching_message('l1', 'Cells are small.');
    await real_service.start_lesson_quiz('l1', 4);
    await real_service.submit_lesson_answers('l1', [0]);
    await real_service.delete_teach_session('l1');

    expect(send_authed_request.mock.calls).toEqual([
      ['/skills/s1/teach-sessions'],
      ['/teach-sessions'],
      ['/skills/s1/teach-sessions', { method: 'POST', body: { topic_id: 't1' } }],
      ['/teach-sessions/l1'],
      ['/teach-sessions/l1/messages', { method: 'POST', body: { message: 'Cells are small.' } }],
      ['/teach-sessions/l1/quiz', { method: 'POST', body: { question_count: 4 } }],
      ['/teach-sessions/l1/results', { method: 'POST', body: { answers: [0] } }],
      ['/teach-sessions/l1', { method: 'DELETE' }],
    ]);
  });
});

describe('ScoreCard', () => {
  it('shows the score in words and as a bar', () => {
    render(<ScoreCard label="Your score" score={80} detail="4 of 5 correct." icon={() => null} />);

    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Your score: 80%' })).toHaveAttribute('value', '80');
  });
});

describe('LessonHistory', () => {
  it('describes how far each lesson got', () => {
    expect(describe_lesson_status(LESSONS[0])).toBe('Teaching grade 50% (you 100%, Pip 0%)');
    expect(describe_lesson_status({ status: 'quiz' })).toBe('Quiz waiting for your answers');
    expect(describe_lesson_status(LESSONS[1])).toBe('Still teaching');
  });

  it('lists lessons to review or continue, and deletes them', async () => {
    teach_service.fetch_teach_sessions.mockResolvedValue(LESSONS);
    teach_service.delete_teach_session.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const on_open = vi.fn();
    render(<LessonHistory skill_id="s1" on_open={on_open} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Review the lesson on Cells' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue the lesson on Mitosis' }));
    expect(on_open.mock.calls).toEqual([['l1'], ['l2']]);

    await userEvent.click(screen.getByRole('button', { name: 'Delete the lesson on Cells' }));
    expect(teach_service.delete_teach_session).toHaveBeenCalledWith('l1');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
  });

  it('says when there are no lessons', async () => {
    render(<LessonHistory skill_id="s1" on_open={vi.fn()} />);

    expect(await screen.findByText('No lessons in this skill yet.')).toBeInTheDocument();
  });
});

describe('TeachSetup', () => {
  it('builds the request for a map topic or a typed one', () => {
    expect(build_lesson_details('t1', '')).toEqual({ topic_id: 't1' });
    expect(build_lesson_details(CUSTOM_LESSON_TOPIC, 'Osmosis')).toEqual({ topic: 'Osmosis' });
  });

  it('starts a lesson on the chosen topic, listing topics at every level', async () => {
    teach_service.start_teach_session.mockResolvedValue(TEACHING_SESSION);
    const on_started = vi.fn();
    render_in_router(<TeachSetup initial_skill_id="s1" initial_topic_id="t2" on_started={on_started} on_open_lesson={vi.fn()} />);

    expect(await screen.findByRole('option', { name: '— Mitosis' })).toBeInTheDocument();
    expect(screen.getByLabelText('Topic to teach')).toHaveValue('t2');
    await userEvent.click(screen.getByRole('button', { name: 'Start teaching Pip' }));

    expect(teach_service.start_teach_session).toHaveBeenCalledWith('s1', { topic_id: 't2' });
    expect(on_started).toHaveBeenCalledWith(TEACHING_SESSION);
  });

  it('starts on the first topic of the first skill, not on typing one', async () => {
    render_in_router(<TeachSetup on_started={vi.fn()} on_open_lesson={vi.fn()} />);

    // The first topic is chosen once the topics load, which also enables Start.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start teaching Pip' })).toBeEnabled());
    expect(screen.getByLabelText('Topic to teach')).toHaveValue('t1');
    expect(screen.queryByLabelText('Your topic')).not.toBeInTheDocument();
  });

  it('lets the student type a topic, and shows errors', async () => {
    fetch_topic_map.mockResolvedValue({ topics: [], suggestions: [] });
    teach_service.start_teach_session.mockRejectedValue(
      Object.assign(new Error('Please fix the highlighted fields'), { field_errors: { topic: 'Topic is required' } }),
    );
    render_in_router(<TeachSetup on_started={vi.fn()} on_open_lesson={vi.fn()} />);

    // With no topics on the map, the form switches to typing one once the (empty) list loads.
    await screen.findByLabelText('Your topic');
    await userEvent.click(screen.getByRole('button', { name: 'Start teaching Pip' }));

    expect(teach_service.start_teach_session).toHaveBeenCalledWith('s1', { topic: '' });
    expect(await screen.findByText('Topic is required')).toBeInTheDocument();
  });

  it('points to the skill map when there are no skills', async () => {
    fetch_skills.mockResolvedValue([]);
    render_in_router(<TeachSetup on_started={vi.fn()} on_open_lesson={vi.fn()} />);

    expect(await screen.findByRole('link', { name: 'skill map' })).toHaveAttribute('href', '/dashboard/skill-map');
  });
});

describe('TeachLesson', () => {
  it("turns the lesson into the chat thread's shape", () => {
    expect(to_chat_messages([GREETING, { role: 'teacher', content: 'Cells are small.' }])).toEqual([
      { id: 'lesson-0', role: 'assistant', content: "Hi! I'm Pip." },
      { id: 'lesson-1', role: 'user', content: 'Cells are small.' },
    ]);
  });

  it('sends explanations, labelled as You and Pip', async () => {
    const taught_session = {
      ...TEACHING_SESSION,
      lesson_messages: [GREETING, { role: 'teacher', content: 'Cells are small.' }, { role: 'ai_student', content: 'How small?' }],
      teacher_message_count: 1,
    };
    teach_service.send_teaching_message.mockResolvedValue(taught_session);
    const on_session_changed = vi.fn();
    render(<TeachLesson teach_session={TEACHING_SESSION} on_session_changed={on_session_changed} />);

    expect(within(screen.getByRole('log')).getByText('Pip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish and quiz us both' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Your explanation'), 'Cells are small.');
    await userEvent.click(screen.getByRole('button', { name: 'Teach Pip' }));

    expect(teach_service.send_teaching_message).toHaveBeenCalledWith('l1', 'Cells are small.');
    expect(on_session_changed).toHaveBeenCalledWith(taught_session);
  });

  it('puts the explanation back when the AI fails', async () => {
    teach_service.send_teaching_message.mockRejectedValue(new Error('The AI is busy right now.'));
    render(<TeachLesson teach_session={TEACHING_SESSION} on_session_changed={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Your explanation'), 'Cells are small.{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now.');
    expect(screen.getByLabelText('Your explanation')).toHaveValue('Cells are small.');
  });

  it('ends the lesson with a quiz of the chosen length, and shows errors', async () => {
    teach_service.start_lesson_quiz.mockRejectedValueOnce(new Error('Busy')).mockResolvedValueOnce(QUIZ_SESSION);
    const on_session_changed = vi.fn();
    render(<TeachLesson teach_session={{ ...TEACHING_SESSION, teacher_message_count: 1 }} on_session_changed={on_session_changed} />);

    await userEvent.clear(screen.getByLabelText('Questions'));
    await userEvent.type(screen.getByLabelText('Questions'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Finish and quiz us both' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Busy');

    await userEvent.click(screen.getByRole('button', { name: 'Finish and quiz us both' }));
    expect(teach_service.start_lesson_quiz).toHaveBeenLastCalledWith('l1', 4);
    expect(on_session_changed).toHaveBeenCalledWith(QUIZ_SESSION);
  });

  it('stops taking explanations when the lesson is full', () => {
    render(<TeachLesson teach_session={{ ...TEACHING_SESSION, teacher_message_count: 15 }} on_session_changed={vi.fn()} />);

    expect(screen.getByText(/That's a full lesson/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Your explanation')).not.toBeInTheDocument();
  });
});

describe('TeachQuiz', () => {
  it("sends the student's answers to the lesson, not the plain quiz", async () => {
    teach_service.submit_lesson_answers.mockResolvedValue({ teach_session: DONE_SESSION, topic: null });
    const on_graded = vi.fn();
    render(<TeachQuiz teach_session={QUIZ_SESSION} feedback_timing="at_end" on_graded={on_graded} />);

    expect(screen.getByText(/Pip has already answered/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'A. Nucleus' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish quiz' }));

    expect(teach_service.submit_lesson_answers).toHaveBeenCalledWith('l1', [0]);
    expect(on_graded).toHaveBeenCalledWith({ teach_session: DONE_SESSION, topic: null });
  });
});

describe('TeachResults', () => {
  it('describes each answer in words', () => {
    expect(describe_answer_outcome(null, false).label).toBe("Didn't know");
    expect(describe_answer_outcome(0, true).label).toBe('Correct');
    expect(describe_answer_outcome(1, false).label).toBe('Incorrect');
  });

  it("shows both scores, the teaching grade, Pip's note and each question side by side", async () => {
    const on_teach_again = vi.fn();
    const on_back = vi.fn();
    render_in_router(
      <TeachResults
        teach_session={DONE_SESSION}
        topic={{ topic: 'Cells', mastery_score: 100, mastery_level: 'strong' }}
        on_teach_again={on_teach_again}
        on_back={on_back}
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'Teaching grade: 50%' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: "Pip's score: 0%" })).toBeInTheDocument();
    expect(screen.getByText('Tell me more about the nucleus.')).toBeInTheDocument();
    expect(screen.getByText(/on your skill map is now/)).toHaveTextContent('Strong · 100%');
    const review_item = screen.getByRole('listitem');
    expect(review_item).toHaveTextContent('You: Correct(A. Nucleus)');
    expect(review_item).toHaveTextContent("Pip: Didn't know");
    expect(review_item).toHaveTextContent('Pip: "You didn\'t teach me that."');

    await userEvent.click(screen.getByRole('button', { name: 'Teach this topic again' }));
    await userEvent.click(screen.getByRole('button', { name: 'All lessons' }));
    expect(on_teach_again).toHaveBeenCalled();
    expect(on_back).toHaveBeenCalled();
  });
});

describe('AiStudentResults', () => {
  it('invites the student to start a lesson when there are none', async () => {
    render_in_router(<AiStudentResults />);

    expect(await screen.findByRole('link', { name: 'Start a lesson' })).toHaveAttribute('href', '/dashboard/teach');
  });

  it("shows Pip's score, the student's and the teaching grade for each lesson", async () => {
    teach_service.fetch_teach_sessions.mockResolvedValue(LESSONS);
    render_in_router(<AiStudentResults />);

    expect(await screen.findByRole('progressbar', { name: 'Cells, Pip: 0%' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Cells, Teaching grade: 50%' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue the lesson on Mitosis' })).toHaveAttribute('href', '/dashboard/teach?session=l2');
    expect(teach_service.fetch_teach_sessions).toHaveBeenCalledWith();
  });
});

describe('TeachPage', () => {
  it('teaches the same topic again: the map topic if there was one', () => {
    expect(build_repeat_lesson_details(DONE_SESSION)).toEqual({ topic_id: 't1' });
    expect(build_repeat_lesson_details({ topic_id: null, topic: 'Osmosis' })).toEqual({ topic: 'Osmosis' });
  });

  it('starts a lesson from the setup form and keeps it in the address', async () => {
    teach_service.start_teach_session.mockResolvedValue(TEACHING_SESSION);
    teach_service.fetch_teach_session.mockResolvedValue(TEACHING_SESSION);
    const { router } = render_in_router(<TeachPage />, { initial_path: '/dashboard/teach?skill=s1&topic=t1', auth_value: SIGNED_IN });

    expect(screen.getByRole('heading', { level: 1, name: 'Teach the AI student' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Cells' });
    // The form settles on its topic after the topics load; under a busy test run that can lag.
    await waitFor(() => expect(screen.getByLabelText('Topic to teach')).toHaveValue('t1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start teaching Pip' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Start teaching Pip' }));

    expect(await screen.findByRole('heading', { name: 'Teaching Cells' }, { timeout: 3000 })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?session=l1');
  });

  it('resumes a lesson waiting for answers, then shows the results', async () => {
    teach_service.fetch_teach_session.mockResolvedValue(QUIZ_SESSION);
    teach_service.submit_lesson_answers.mockResolvedValue({
      teach_session: DONE_SESSION,
      topic: { topic: 'Cells', mastery_score: 100, mastery_level: 'strong' },
    });
    render_in_router(<TeachPage />, { initial_path: '/dashboard/teach?session=l1', auth_value: SIGNED_IN });

    await userEvent.click(await screen.findByRole('radio', { name: 'A. Nucleus' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish quiz' }));

    expect(await screen.findByRole('heading', { name: 'How the lesson on Cells went' })).toBeInTheDocument();
    expect(screen.getByText(/on your skill map is now/)).toBeInTheDocument();
  });

  it('starts the same topic again from the results, and goes back to all lessons', async () => {
    teach_service.fetch_teach_session.mockResolvedValueOnce(DONE_SESSION).mockResolvedValue({ ...TEACHING_SESSION, id: 'l9' });
    teach_service.start_teach_session.mockResolvedValue({ ...TEACHING_SESSION, id: 'l9' });
    const { router } = render_in_router(<TeachPage />, { initial_path: '/dashboard/teach?session=l1', auth_value: SIGNED_IN });

    await userEvent.click(await screen.findByRole('button', { name: 'Teach this topic again' }));
    expect(teach_service.start_teach_session).toHaveBeenCalledWith('s1', { topic_id: 't1' });
    await waitFor(() => expect(router.state.location.search).toBe('?session=l9'));
    expect(await screen.findByRole('heading', { name: 'Teaching Cells' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'All lessons' }));
    expect(router.state.location.search).toBe('');
    expect(await screen.findByRole('button', { name: 'Start teaching Pip' })).toBeInTheDocument();
  });

  it('shows an error for a lesson that cannot load', async () => {
    teach_service.fetch_teach_session.mockRejectedValue(new Error('Lesson not found'));
    render_in_router(<TeachPage />, { initial_path: '/dashboard/teach?session=missing', auth_value: SIGNED_IN });

    expect(await screen.findByRole('alert')).toHaveTextContent('Lesson not found');
  });
});
