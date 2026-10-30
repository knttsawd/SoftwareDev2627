import { randomUUID } from 'node:crypto';
import {
  AI_STUDENT_NAME,
  HTTP_STATUS,
  MAX_TEACH_MESSAGES,
  RECENT_TEACH_SESSIONS_LIMIT,
  TEACH_SCORE_WEIGHTS,
} from '../config/constants.js';
import { create_http_error } from './http_error.js';
import {
  create_practice_quiz,
  delete_quiz,
  get_owned_quiz,
  resolve_quiz_topic,
  save_quiz_result,
  submit_quiz_answers,
  to_public_quiz,
} from './quiz_service.js';
import { get_owned_skill } from './skill_service.js';
import { format_topic_path } from './topic_service.js';

// "Teach the AI student". A session goes through three stages:
//   teaching  the student explains the topic; the AI student replies and asks questions
//   quiz      both have the same quiz; the AI student has already answered it, from the
//             lesson only, but its answers stay hidden until the student has answered too
//   done      both are graded and combined into one teaching grade

export const TEACH_SESSION_STATUS = { teaching: 'teaching', quiz: 'quiz', done: 'done' };

const SESSION_COLUMNS =
  'id, user_id, skill_id, skill_node_id, topic, lesson_messages, quiz_id, combined_score, ai_student_reasons, teaching_feedback, created_at';

export function get_teach_session_status(session_row) {
  if (!session_row.quiz_id) return TEACH_SESSION_STATUS.teaching;
  return session_row.combined_score === null ? TEACH_SESSION_STATUS.quiz : TEACH_SESSION_STATUS.done;
}

// The AI student's first message, so the lesson opens with an invitation, not a blank box.
export function build_greeting(topic) {
  return `Hi! I'm ${AI_STUDENT_NAME}. I don't know anything about ${topic} yet, so I can only learn what you teach me. Where should we start?`;
}

export function count_teacher_messages(lesson_messages) {
  return lesson_messages.filter((lesson_message) => lesson_message.role === 'teacher').length;
}

// The teaching grade: the student's and the AI student's scores, weighted by TEACH_SCORE_WEIGHTS.
export function combine_scores(student_score, ai_student_score) {
  return Math.round(student_score * TEACH_SCORE_WEIGHTS.student + ai_student_score * TEACH_SCORE_WEIGHTS.ai_student);
}

// Each question with both takers' answers side by side, for the review after grading.
export function build_teach_review(questions, student_answers, ai_student_answers, ai_student_reasons) {
  return questions.map((quiz_question, question_index) => ({
    question: quiz_question.question,
    choices: quiz_question.choices,
    correct_index: quiz_question.correct_index,
    explanation: quiz_question.explanation,
    student_choice: student_answers[question_index],
    student_is_correct: student_answers[question_index] === quiz_question.correct_index,
    ai_student_choice: ai_student_answers[question_index],
    ai_student_is_correct: ai_student_answers[question_index] === quiz_question.correct_index,
    ai_student_reason: ai_student_reasons[question_index] ?? '',
  }));
}

// One taker's saved result for a session, with its answers parsed, or null.
export function find_session_result(database, session_id, taker) {
  const result_row = database
    .prepare('SELECT answers, correct_count, total_count, score FROM quiz_results WHERE teach_session_id = ? AND taker = ?')
    .get(session_id, taker);
  return result_row ? { ...result_row, answers: JSON.parse(result_row.answers) } : null;
}

// The graded results of a finished session.
function build_teach_results(database, session_row) {
  const questions = JSON.parse(get_owned_quiz(database, session_row.user_id, session_row.quiz_id).questions);
  const student_result = find_session_result(database, session_row.id, 'student');
  const ai_student_result = find_session_result(database, session_row.id, 'ai_student');
  const summarize = ({ score, correct_count, total_count }) => ({ score, correct_count, total_count });
  return {
    combined_score: session_row.combined_score,
    student: summarize(student_result),
    ai_student: summarize(ai_student_result),
    teaching_feedback: session_row.teaching_feedback,
    review: build_teach_review(
      questions,
      student_result.answers,
      ai_student_result.answers,
      JSON.parse(session_row.ai_student_reasons),
    ),
  };
}

// The session as the client sees it: the lesson, plus the quiz (without answers) while
// it's being taken, or the results once it's done.
export function to_teach_session(database, session_row) {
  const status = get_teach_session_status(session_row);
  const lesson_messages = JSON.parse(session_row.lesson_messages);
  return {
    id: session_row.id,
    skill_id: session_row.skill_id,
    topic_id: session_row.skill_node_id,
    topic: session_row.topic,
    status,
    lesson_messages,
    teacher_message_count: count_teacher_messages(lesson_messages),
    max_teacher_messages: MAX_TEACH_MESSAGES,
    created_at: session_row.created_at,
    quiz:
      status === TEACH_SESSION_STATUS.quiz
        ? to_public_quiz(get_owned_quiz(database, session_row.user_id, session_row.quiz_id))
        : null,
    results: status === TEACH_SESSION_STATUS.done ? build_teach_results(database, session_row) : null,
  };
}

export function get_owned_teach_session(database, user_id, session_id) {
  const session_row = database
    .prepare(`SELECT ${SESSION_COLUMNS} FROM teach_sessions WHERE id = ? AND user_id = ?`)
    .get(session_id, user_id);
  if (!session_row) throw create_http_error(HTTP_STATUS.not_found, 'Lesson not found');
  return session_row;
}

// The student's lessons, newest first, in one skill or (skill_id null) every skill, each
// with both scores once graded.
export function list_teach_sessions(database, user_id, { skill_id = null, limit = RECENT_TEACH_SESSIONS_LIMIT } = {}) {
  return database
    .prepare(
      `SELECT teach_sessions.id, teach_sessions.skill_id, skills.name AS skill_name, teach_sessions.topic,
              teach_sessions.quiz_id, teach_sessions.combined_score, teach_sessions.created_at,
              (SELECT score FROM quiz_results
               WHERE quiz_results.teach_session_id = teach_sessions.id AND taker = 'student') AS student_score,
              (SELECT score FROM quiz_results
               WHERE quiz_results.teach_session_id = teach_sessions.id AND taker = 'ai_student') AS ai_student_score
       FROM teach_sessions JOIN skills ON skills.id = teach_sessions.skill_id
       WHERE teach_sessions.user_id = ? AND (? IS NULL OR teach_sessions.skill_id = ?)
       ORDER BY teach_sessions.created_at DESC, teach_sessions.rowid DESC
       LIMIT ?`,
    )
    .all(user_id, skill_id, skill_id, limit)
    .map(({ quiz_id, ...session_summary }) => ({
      ...session_summary,
      status: get_teach_session_status({ quiz_id, combined_score: session_summary.combined_score }),
    }));
}

// Starts a lesson on a map topic (topic_id) or a typed topic. The AI student greets first.
export function start_teach_session(database, user_id, skill, topic_details) {
  const { topic, topic_id } = resolve_quiz_topic(database, user_id, skill.id, topic_details);
  const session_id = randomUUID();
  database
    .prepare('INSERT INTO teach_sessions (id, user_id, skill_id, skill_node_id, topic, lesson_messages) VALUES (?, ?, ?, ?, ?, ?)')
    .run(session_id, user_id, skill.id, topic_id, topic, JSON.stringify([{ role: 'ai_student', content: build_greeting(topic) }]));
  return to_teach_session(database, get_owned_teach_session(database, user_id, session_id));
}

function assert_status(session_row, expected_status, message) {
  if (get_teach_session_status(session_row) !== expected_status) throw create_http_error(HTTP_STATUS.conflict, message);
}

// Adds one explanation and the AI student's reply. Lessons stop taking explanations after
// MAX_TEACH_MESSAGES, which keeps each AI call small.
export async function add_teaching_message({ database, ai_provider, user_id, session_row, message }) {
  assert_status(session_row, TEACH_SESSION_STATUS.teaching, 'This lesson is over. Start a new one to keep teaching.');
  const lesson_messages = JSON.parse(session_row.lesson_messages);
  if (count_teacher_messages(lesson_messages) >= MAX_TEACH_MESSAGES) {
    throw create_http_error(
      HTTP_STATUS.bad_request,
      `That's the most one lesson takes (${MAX_TEACH_MESSAGES} explanations). Start the quiz to see what ${AI_STUDENT_NAME} learned.`,
    );
  }
  const lesson_with_explanation = [...lesson_messages, { role: 'teacher', content: message }];
  const { reply } = await ai_provider.reply_as_ai_student({
    skill_name: get_owned_skill(database, user_id, session_row.skill_id).name,
    topic: session_row.topic,
    topic_path: format_topic_path(database, session_row.skill_node_id),
    lesson_messages: lesson_with_explanation,
  });
  const updated_lesson = [...lesson_with_explanation, { role: 'ai_student', content: reply }];
  database.prepare('UPDATE teach_sessions SET lesson_messages = ? WHERE id = ?').run(JSON.stringify(updated_lesson), session_row.id);
  return to_teach_session(database, get_owned_teach_session(database, user_id, session_row.id));
}

// Ends the lesson: makes one quiz on the topic and has the AI student answer it from the
// lesson alone. Its answers are saved but stay hidden until the student has answered too.
// If the AI student can't answer, the quiz is removed again, so the lesson can carry on.
export async function start_lesson_quiz({ database, ai_provider, user_id, skill, session_row, question_count }) {
  assert_status(session_row, TEACH_SESSION_STATUS.teaching, 'This lesson already has its quiz.');
  const lesson_messages = JSON.parse(session_row.lesson_messages);
  if (count_teacher_messages(lesson_messages) === 0) {
    throw create_http_error(HTTP_STATUS.bad_request, `Teach ${AI_STUDENT_NAME} something first.`);
  }

  const quiz = await create_practice_quiz({
    database,
    ai_provider,
    user_id,
    skill,
    quiz_details: { scope: 'topic', topic: session_row.topic, topic_id: session_row.skill_node_id, question_count },
  });
  let ai_student_answers;
  try {
    ai_student_answers = await ai_provider.take_quiz_as_ai_student({
      skill_name: skill.name,
      topic: session_row.topic,
      topic_path: format_topic_path(database, session_row.skill_node_id),
      lesson_messages,
      questions: quiz.questions,
    });
  } catch (answer_error) {
    delete_quiz(database, user_id, quiz.id);
    throw answer_error;
  }

  save_quiz_result(database, {
    user_id,
    quiz_row: get_owned_quiz(database, user_id, quiz.id),
    answers: ai_student_answers.answers,
    taker: 'ai_student',
    teach_session_id: session_row.id,
  });
  database
    .prepare('UPDATE teach_sessions SET quiz_id = ?, ai_student_reasons = ?, teaching_feedback = ? WHERE id = ?')
    .run(quiz.id, JSON.stringify(ai_student_answers.reasons), ai_student_answers.feedback, session_row.id);
  return to_teach_session(database, get_owned_teach_session(database, user_id, session_row.id));
}

// Grades the student's answers (which also updates the topic on the skill map), then the
// combined teaching grade. Returns { teach_session, topic } with the results revealed.
export function submit_lesson_answers({ database, user_id, session_row, answers }) {
  assert_status(session_row, TEACH_SESSION_STATUS.quiz, 'This lesson has no quiz waiting for answers.');
  const quiz_row = get_owned_quiz(database, user_id, session_row.quiz_id);
  const { result, topic } = submit_quiz_answers(database, user_id, quiz_row, answers, session_row.id);
  const ai_student_result = find_session_result(database, session_row.id, 'ai_student');
  database
    .prepare('UPDATE teach_sessions SET combined_score = ? WHERE id = ?')
    .run(combine_scores(result.score, ai_student_result.score), session_row.id);
  return { teach_session: to_teach_session(database, get_owned_teach_session(database, user_id, session_row.id)), topic };
}

// Deletes the lesson with its quiz and both results.
export function delete_teach_session(database, user_id, session_id) {
  const session_row = get_owned_teach_session(database, user_id, session_id);
  if (session_row.quiz_id) delete_quiz(database, user_id, session_row.quiz_id);
  database.prepare('DELETE FROM teach_sessions WHERE id = ?').run(session_id);
}
