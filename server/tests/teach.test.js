import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create_app } from '../app.js';
import { AI_STUDENT_NAME, IN_MEMORY_DATABASE, MAX_TEACH_MESSAGES } from '../config/constants.js';
import { open_database } from '../db/database.js';
import {
  AI_STUDENT_QUIZ_JSON_SCHEMA,
  AI_STUDENT_REPLY_JSON_SCHEMA,
  build_ai_student_quiz_request,
  build_ai_student_reply_request,
  format_lesson,
  format_numbered_question,
} from '../services/ai/ai_prompts.js';
import {
  DEFAULT_AI_STUDENT_REASON,
  DEFAULT_TEACHING_FEEDBACK,
  normalize_ai_student_answers,
  to_choice_index,
} from '../services/ai/ai_student_answers.js';
import { create_llm_ai_provider } from '../services/ai/llm_ai_provider.js';
import {
  build_mock_ai_student_answers,
  build_mock_ai_student_reply,
  find_teaching_sentence,
  get_teacher_text,
  pick_taught_choice,
  pick_word_to_ask_about,
} from '../services/ai/mock_ai_student.js';
import { list_quizzes } from '../services/quiz_service.js';
import {
  validate_teach_message,
  validate_teach_question_count,
  validate_teach_session_input,
} from '../services/study_validators.js';
import {
  add_teaching_message,
  build_greeting,
  build_teach_review,
  combine_scores,
  count_teacher_messages,
  delete_teach_session,
  get_owned_teach_session,
  get_teach_session_status,
  list_teach_sessions,
  start_lesson_quiz,
  start_teach_session,
  submit_lesson_answers,
} from '../services/teach_service.js';
import { add_topic, get_owned_topic } from '../services/topic_service.js';
import { create_spied_ai, create_student_with_skill, insert_test_resource, SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

const LESSON = [
  { role: 'ai_student', content: 'Hi! Teach me.' },
  { role: 'teacher', content: 'Photosynthesis turns light into glucose. Chlorophyll absorbs sunlight in the leaves.' },
];
const QUESTIONS = [
  { question: 'What absorbs sunlight?', choices: ['Chlorophyll', 'Roots', 'Xylem', 'Stomata'] },
  { question: 'What carries water?', choices: ['Xylem', 'Phloem', 'Stomata', 'Roots'] },
];

describe('AI student prompts', () => {
  it('writes the lesson as Teacher and Pip lines, and numbers quiz choices from 1', () => {
    expect(format_lesson(LESSON)).toBe(`${AI_STUDENT_NAME}: Hi! Teach me.\n\nTeacher: ${LESSON[1].content}`);
    expect(format_numbered_question(QUESTIONS[0], 0)).toBe(
      '1. What absorbs sunlight?\n   1) Chlorophyll\n   2) Roots\n   3) Xylem\n   4) Stomata',
    );
  });

  it('keeps the AI student to what it was taught, in both prompts', () => {
    const reply_request = build_ai_student_reply_request({ topic: 'Photosynthesis', lesson_messages: LESSON });
    const quiz_request = build_ai_student_quiz_request({ topic: 'Photosynthesis', lesson_messages: LESSON, questions: QUESTIONS });

    expect(reply_request.system_prompt).toMatch('Never use outside knowledge');
    expect(reply_request).toMatchObject({ task_tier: 'light', json_schema: AI_STUDENT_REPLY_JSON_SCHEMA });
    expect(reply_request.user_prompt).toMatch(/^<lesson>\n/);
    expect(quiz_request.system_prompt).toMatch('or 0 if the lesson did not give you enough');
    expect(quiz_request.system_prompt).toMatch('Give exactly 2 answers');
    expect(quiz_request).toMatchObject({ task_tier: 'standard', json_schema: AI_STUDENT_QUIZ_JSON_SCHEMA });
    expect(quiz_request.user_prompt).toMatch('Quiz:\n1. What absorbs sunlight?');
  });
});

describe('normalize_ai_student_answers', () => {
  it('turns choice numbers into indexes, with 0 and nonsense meaning "don’t know"', () => {
    expect([to_choice_index(1, 4), to_choice_index(4, 4), to_choice_index(0, 4), to_choice_index(5, 4), to_choice_index('2', 4)]).toEqual([
      0,
      3,
      null,
      null,
      null,
    ]);
  });

  it('gives one answer and reason per question, filling gaps', () => {
    const normalized = normalize_ai_student_answers({ answers: [{ choice_number: 1, reason: ' You said so. ' }], feedback: ' Good. ' }, QUESTIONS);

    expect(normalized).toEqual({ answers: [0, null], reasons: ['You said so.', DEFAULT_AI_STUDENT_REASON], feedback: 'Good.' });
    expect(normalize_ai_student_answers(null, QUESTIONS)).toEqual({
      answers: [null, null],
      reasons: [DEFAULT_AI_STUDENT_REASON, DEFAULT_AI_STUDENT_REASON],
      feedback: DEFAULT_TEACHING_FEEDBACK,
    });
  });
});

describe('AI student methods on a real provider', () => {
  it('returns a trimmed reply and refuses an empty one', async () => {
    const complete_json = vi.fn().mockResolvedValue({ reply: ' Why? ' });
    const ai_provider = create_llm_ai_provider('test', complete_json);

    expect(await ai_provider.reply_as_ai_student({ topic: 'Cells', lesson_messages: LESSON })).toEqual({ reply: 'Why?' });
    complete_json.mockResolvedValue({ reply: '' });
    await expect(ai_provider.reply_as_ai_student({ topic: 'Cells', lesson_messages: LESSON })).rejects.toMatchObject({ status: 502 });
  });

  it('normalizes its quiz answers', async () => {
    const complete_json = vi.fn().mockResolvedValue({ answers: [{ choice_number: 1, reason: 'r' }, { choice_number: 0, reason: 'x' }], feedback: 'f' });
    const ai_provider = create_llm_ai_provider('test', complete_json);

    expect(await ai_provider.take_quiz_as_ai_student({ topic: 'Cells', lesson_messages: LESSON, questions: QUESTIONS })).toEqual({
      answers: [0, null],
      reasons: ['r', 'x'],
      feedback: 'f',
    });
  });
});

describe('practice-mode AI student', () => {
  it('collects only what the teacher said', () => {
    expect(get_teacher_text(LESSON)).toBe(LESSON[1].content);
  });

  it('asks about a word from the latest explanation, or for more', () => {
    expect(pick_word_to_ask_about('Chlorophyll absorbs sunlight. Chlorophyll is green.', 'Photosynthesis')).toBe('chlorophyll');
    expect(build_mock_ai_student_reply({ topic: 'Photosynthesis', lesson_messages: LESSON }).reply).toBe(
      'Okay, I think I\'m starting to get it. What does "chlorophyll" mean?',
    );
    expect(build_mock_ai_student_reply({ topic: 'Cells', lesson_messages: [{ role: 'teacher', content: 'Cells.' }] }).reply).toBe(
      "Can you tell me more? I still don't know much about Cells.",
    );
  });

  it('asks a different kind of question after each explanation', () => {
    const explanations = [
      'Chlorophyll is the green pigment that absorbs sunlight in leaves.',
      'Glucose is the sugar that plants make and store for energy.',
      'Stomata are tiny holes that let carbon dioxide into the leaf.',
      'Respiration releases the energy stored in glucose for the cells.',
    ];
    const lesson = explanations.map((content) => ({ role: 'teacher', content }));

    const replies = explanations.map(
      (_, count) => build_mock_ai_student_reply({ topic: 'Plants', lesson_messages: lesson.slice(0, count + 1) }).reply,
    );

    expect(replies.map((reply) => reply.split('. ').at(-1))).toEqual([
      'What does "chlorophyll" mean?',
      'Can you give me an example of glucose?',
      'Why does stomata matter?',
      'How does respiration fit with what you told me before?',
    ]);
  });

  it('answers with the choice the lesson mentions, and never guesses', () => {
    expect(pick_taught_choice(QUESTIONS[0].choices, LESSON[1].content)).toBe(0);
    expect(pick_taught_choice(QUESTIONS[1].choices, LESSON[1].content)).toBeNull();
    expect(pick_taught_choice(['Light', 'Leaves'], 'light and leaves')).toBeNull();
    expect(find_teaching_sentence(LESSON[1].content, 'Chlorophyll')).toBe('Chlorophyll absorbs sunlight in the leaves.');
  });

  it('takes the quiz with reasons and feedback', () => {
    const { answers, reasons, feedback } = build_mock_ai_student_answers({ lesson_messages: LESSON, questions: QUESTIONS });

    expect(answers).toEqual([0, null]);
    expect(reasons).toEqual(['You told me: "Chlorophyll absorbs sunlight in the leaves."', DEFAULT_AI_STUDENT_REASON]);
    expect(feedback).toMatch('I could answer 1 of 2 questions');
  });
});

describe('teach session helpers', () => {
  it('works out the stage from what has happened', () => {
    expect(get_teach_session_status({ quiz_id: null, combined_score: null })).toBe('teaching');
    expect(get_teach_session_status({ quiz_id: 'q', combined_score: null })).toBe('quiz');
    expect(get_teach_session_status({ quiz_id: 'q', combined_score: 70 })).toBe('done');
  });

  it('greets, counts explanations and combines the scores', () => {
    expect(build_greeting('Cells')).toMatch(`I'm ${AI_STUDENT_NAME}. I don't know anything about Cells`);
    expect(count_teacher_messages(LESSON)).toBe(1);
    expect(combine_scores(80, 41)).toBe(61);
  });

  it('puts both takers’ answers side by side', () => {
    const questions = [{ question: 'Q', choices: ['a', 'b'], correct_index: 1, explanation: 'E' }];

    expect(build_teach_review(questions, [1], [null], ['Not taught.'])).toEqual([
      {
        question: 'Q',
        choices: ['a', 'b'],
        correct_index: 1,
        explanation: 'E',
        student_choice: 1,
        student_is_correct: true,
        ai_student_choice: null,
        ai_student_is_correct: false,
        ai_student_reason: 'Not taught.',
      },
    ]);
  });

  it('checks lesson input', () => {
    expect(validate_teach_session_input({ topic: ' Cells ' }).values).toEqual({ topic: 'Cells', topic_id: null });
    expect(validate_teach_session_input({}).field_errors).toEqual({ topic: 'Topic is required' });
    expect(validate_teach_message(' ')).toBe('Write or say an explanation first');
    expect(validate_teach_message('x'.repeat(4001))).toMatch('under 4000 characters');
    expect(validate_teach_question_count(undefined)).toBeNull();
    expect(validate_teach_question_count(11)).toBe('Choose between 3 and 10 questions');
  });
});

describe('a whole lesson', () => {
  let database;
  let user_id;
  let skill;
  let ai_provider;

  beforeEach(async () => {
    database = open_database(IN_MEMORY_DATABASE);
    ({ user_id, skill } = await create_student_with_skill(database));
    insert_test_resource(database, { user_id, skill_id: skill.id });
    ({ ai_provider } = create_spied_ai());
  });

  // Starts a lesson on a map topic and adds one explanation; returns { topic, teach_session }.
  async function start_and_teach(explanation = 'Chlorophyll inside the chloroplasts absorbs sunlight, mostly red and blue light.') {
    const topic = add_topic(database, user_id, skill.id, { topic: 'Photosynthesis' });
    const started = start_teach_session(database, user_id, skill, { topic_id: topic.id });
    const session_row = get_owned_teach_session(database, user_id, started.id);
    const teach_session = await add_teaching_message({ database, ai_provider, user_id, session_row, message: explanation });
    return { topic, teach_session };
  }

  it('opens with the AI student’s greeting, then records each explanation and reply', async () => {
    const { teach_session } = await start_and_teach();

    expect(teach_session).toMatchObject({ status: 'teaching', topic: 'Photosynthesis', teacher_message_count: 1, quiz: null });
    expect(teach_session.lesson_messages.map((lesson_message) => lesson_message.role)).toEqual(['ai_student', 'teacher', 'ai_student']);
    expect(teach_session.lesson_messages[0].content).toBe(build_greeting('Photosynthesis'));
  });

  it(`stops taking explanations after ${MAX_TEACH_MESSAGES}`, async () => {
    const { teach_session } = await start_and_teach();
    const full_lesson = Array.from({ length: MAX_TEACH_MESSAGES }, () => ({ role: 'teacher', content: 'x' }));
    database.prepare('UPDATE teach_sessions SET lesson_messages = ? WHERE id = ?').run(JSON.stringify(full_lesson), teach_session.id);

    await expect(
      add_teaching_message({ database, ai_provider, user_id, session_row: get_owned_teach_session(database, user_id, teach_session.id), message: 'More' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('needs an explanation before the quiz', async () => {
    const started = start_teach_session(database, user_id, skill, { topic: 'Cells' });

    await expect(
      start_lesson_quiz({ database, ai_provider, user_id, skill, session_row: get_owned_teach_session(database, user_id, started.id), question_count: 3 }),
    ).rejects.toThrow(`Teach ${AI_STUDENT_NAME} something first`);
  });

  it('quizzes both, hides the AI student’s answers until the student answers, then grades both', async () => {
    const { topic, teach_session } = await start_and_teach();

    const quiz_stage = await start_lesson_quiz({
      database,
      ai_provider,
      user_id,
      skill,
      session_row: get_owned_teach_session(database, user_id, teach_session.id),
      question_count: 3,
    });
    expect(quiz_stage.status).toBe('quiz');
    expect(quiz_stage.results).toBeNull();
    expect(quiz_stage.quiz.questions[0]).not.toHaveProperty('correct_index');
    expect(list_quizzes(database, user_id, skill.id)).toEqual([]);
    await expect(
      add_teaching_message({ database, ai_provider, user_id, session_row: get_owned_teach_session(database, user_id, teach_session.id), message: 'More' }),
    ).rejects.toMatchObject({ status: 409 });

    const { teach_session: done, topic: updated_topic } = submit_lesson_answers({
      database,
      user_id,
      session_row: get_owned_teach_session(database, user_id, teach_session.id),
      answers: [null, null, null],
    });
    expect(done.status).toBe('done');
    expect(done.results.student.score).toBe(0);
    expect(done.results.combined_score).toBe(combine_scores(0, done.results.ai_student.score));
    expect(done.results.review).toHaveLength(3);
    expect(done.results.teaching_feedback).toMatch('I could answer');
    expect(updated_topic.id).toBe(topic.id);
    expect(get_owned_topic(database, user_id, topic.id).mastery_level).toBe('weak');
    expect(list_teach_sessions(database, user_id)).toEqual([
      expect.objectContaining({ id: teach_session.id, status: 'done', student_score: 0, skill_name: 'Biology' }),
    ]);
  });

  it('removes the new quiz again if the AI student cannot answer', async () => {
    const { teach_session } = await start_and_teach();
    vi.spyOn(ai_provider, 'take_quiz_as_ai_student').mockRejectedValue(new Error('busy'));

    await expect(
      start_lesson_quiz({ database, ai_provider, user_id, skill, session_row: get_owned_teach_session(database, user_id, teach_session.id), question_count: 3 }),
    ).rejects.toThrow('busy');
    expect(database.prepare('SELECT count(*) AS quiz_count FROM quizzes').get().quiz_count).toBe(0);
    expect(get_teach_session_status(get_owned_teach_session(database, user_id, teach_session.id))).toBe('teaching');
  });

  it('refuses answers before there is a quiz, and deletes a lesson with its quiz', async () => {
    const { teach_session } = await start_and_teach();
    const session_row = get_owned_teach_session(database, user_id, teach_session.id);

    expect(() => submit_lesson_answers({ database, user_id, session_row, answers: [] })).toThrow(expect.objectContaining({ status: 409 }));
    await start_lesson_quiz({ database, ai_provider, user_id, skill, session_row, question_count: 3 });
    delete_teach_session(database, user_id, teach_session.id);
    expect(list_teach_sessions(database, user_id)).toEqual([]);
    expect(database.prepare('SELECT count(*) AS quiz_count FROM quizzes').get().quiz_count).toBe(0);
  });
});

describe('teach routes', () => {
  it('runs a lesson from start to graded results', async () => {
    const { ai_provider, transcriber } = create_spied_ai();
    const app = create_app({ database: open_database(IN_MEMORY_DATABASE), uploads_path: '.', client_origin: '', ai_provider, transcriber });
    const auth_header = `Bearer ${(await request(app).post('/api/auth/signup').send(TEST_SIGNUP)).body.token}`;
    const as_student = (method, url) => request(app)[method](url).set('Authorization', auth_header);
    const skill = (await as_student('post', '/api/skills').send({ name: 'Biology' })).body;
    await as_student('post', `/api/skills/${skill.id}/resources/text`).send({ title: 'Notes', text: SAMPLE_STUDY_TEXT });

    const started = await as_student('post', `/api/skills/${skill.id}/teach-sessions`).send({ topic: 'Photosynthesis' });
    expect(started.status).toBe(201);
    expect((await as_student('post', `/api/skills/${skill.id}/teach-sessions`).send({})).status).toBe(400);

    const session_url = `/api/teach-sessions/${started.body.id}`;
    expect((await as_student('post', `${session_url}/messages`).send({ message: '' })).status).toBe(400);
    const taught = await as_student('post', `${session_url}/messages`).send({ message: 'Plants take in carbon dioxide through stomata.' });
    expect(taught.body.teacher_message_count).toBe(1);

    expect((await as_student('post', `${session_url}/quiz`).send({ question_count: 20 })).status).toBe(400);
    const quiz_stage = await as_student('post', `${session_url}/quiz`).send({ question_count: 3 });
    expect(quiz_stage.body.status).toBe('quiz');

    expect((await as_student('post', `${session_url}/results`).send({ answers: [0] })).status).toBe(400);
    const graded = await as_student('post', `${session_url}/results`).send({ answers: [0, 1, null] });
    expect(graded.status).toBe(201);
    expect(graded.body.teach_session.results).toHaveProperty('combined_score');

    expect((await as_student('get', session_url)).body.status).toBe('done');
    expect((await as_student('get', `/api/skills/${skill.id}/teach-sessions`)).body).toHaveLength(1);
    expect((await as_student('get', '/api/teach-sessions')).body).toHaveLength(1);
    expect((await as_student('delete', session_url)).status).toBe(204);
    expect((await as_student('get', session_url)).status).toBe(404);
  });
});
