import { randomUUID } from 'node:crypto';
import { HTTP_STATUS, RECENT_RESULTS_LIMIT } from '../config/constants.js';
import { select_overview_text } from './ai/source_selection.js';
import { create_http_error } from './http_error.js';
import { get_learning_style } from './learning_profile_service.js';
import { get_owned_resource, get_skill_overview_text } from './resource_service.js';
import { get_topic_source_text } from './topic_resource_service.js';
import { find_topic_by_name, format_topic_path, get_owned_topic, update_topic_mastery } from './topic_service.js';

// The client never receives correct answers or explanations before a quiz is graded, so
// they can't be peeked at in the browser's network tab.
export function to_public_quiz(quiz_row) {
  return {
    id: quiz_row.id,
    skill_id: quiz_row.skill_id,
    topic_id: quiz_row.skill_node_id,
    scope: quiz_row.scope,
    resource_id: quiz_row.resource_id,
    topic: quiz_row.topic,
    created_at: quiz_row.created_at,
    questions: JSON.parse(quiz_row.questions).map(({ question, choices }) => ({ question, choices })),
  };
}

// Newest first, with a question count instead of the questions. Quizzes made for a
// "teach the AI student" lesson are left out; they live with their lesson.
export function list_quizzes(database, user_id, skill_id) {
  return database
    .prepare(
      `SELECT id, skill_id, skill_node_id AS topic_id, scope, resource_id, topic, created_at,
              json_array_length(questions) AS question_count
       FROM quizzes
       WHERE user_id = ? AND skill_id = ?
         AND id NOT IN (SELECT quiz_id FROM teach_sessions WHERE quiz_id IS NOT NULL)
       ORDER BY created_at DESC`,
    )
    .all(user_id, skill_id);
}

export function get_owned_quiz(database, user_id, quiz_id) {
  const quiz_row = database.prepare('SELECT * FROM quizzes WHERE id = ? AND user_id = ?').get(quiz_id, user_id);
  if (!quiz_row) throw create_http_error(HTTP_STATUS.not_found, 'Quiz not found');
  return quiz_row;
}

// Works out which map topic a new quiz belongs to: the one picked on the map (topic_id),
// or the skill's topic with the same name as the typed topic, or none.
// Returns { topic, topic_id, search_text }: the topic name to quiz on, the map topic's id
// (or null), and the words used to pick relevant parts of the resources.
export function resolve_quiz_topic(database, user_id, skill_id, { topic, topic_id }) {
  if (topic_id) {
    const map_topic = get_owned_topic(database, user_id, topic_id);
    if (map_topic.skill_id !== skill_id) {
      throw create_http_error(HTTP_STATUS.bad_request, 'That topic belongs to a different skill');
    }
    return { topic: map_topic.topic, topic_id: map_topic.id, search_text: `${map_topic.topic} ${map_topic.summary ?? ''}` };
  }
  const matching_topic = find_topic_by_name(database, user_id, skill_id, topic);
  return { topic, topic_id: matching_topic?.id ?? null, search_text: topic };
}

// A quiz on one resource covers that resource only, sampled from start to end. Its score
// counts toward the topic the resource is filed under, if any.
export function plan_resource_quiz(database, user_id, skill, resource_id) {
  const resource = get_owned_resource(database, user_id, resource_id);
  if (resource.skill_id !== skill.id) {
    throw create_http_error(HTTP_STATUS.bad_request, 'That resource belongs to a different skill');
  }
  return {
    scope: 'resource',
    topic: resource.title,
    topic_id: resource.topic_id,
    resource_id: resource.id,
    ai_topic: `the resource "${resource.title}"`,
    source_text: select_overview_text([resource]),
    is_source_only: true,
  };
}

// A quiz on the whole skill samples every resource evenly; with none, the AI covers the
// subject from general knowledge. It isn't tied to one map topic.
export function plan_skill_quiz(database, user_id, skill) {
  return {
    scope: 'skill',
    topic: `All of ${skill.name}`,
    topic_id: null,
    resource_id: null,
    ai_topic: `the whole subject "${skill.name}", spread across its main areas`,
    source_text: get_skill_overview_text(database, user_id, skill.id),
    is_source_only: false,
  };
}

// A quiz on a map topic or a typed topic. A map topic's own resources (and its subtopics')
// come first; the AI fills gaps from general knowledge.
export function plan_topic_quiz(database, user_id, skill, quiz_details) {
  const { topic, topic_id, search_text } = resolve_quiz_topic(database, user_id, skill.id, quiz_details);
  return {
    scope: 'topic',
    topic,
    topic_id,
    resource_id: null,
    ai_topic: topic,
    source_text: get_topic_source_text(database, user_id, skill.id, { search_text, topic_id }),
    is_source_only: false,
  };
}

// What a new quiz covers and what the AI reads for it, from quiz_details.scope:
// { scope, topic, topic_id, resource_id, ai_topic, source_text, is_source_only }, where
// topic is the name saved and shown, topic_id the map topic the score counts toward (or
// null), and ai_topic how the quiz's subject is described to the AI.
export function plan_quiz(database, user_id, skill, quiz_details) {
  if (quiz_details.scope === 'resource') return plan_resource_quiz(database, user_id, skill, quiz_details.resource_id);
  if (quiz_details.scope === 'skill') return plan_skill_quiz(database, user_id, skill);
  return plan_topic_quiz(database, user_id, skill, quiz_details);
}

// Asks the AI for a multiple-choice quiz and saves it with its answers. quiz_details is
// the output of validate_quiz_input: { scope, topic, topic_id, resource_id, question_count }.
// Returns the quiz without the answers.
export async function create_practice_quiz({ database, ai_provider, user_id, skill, quiz_details }) {
  const quiz_plan = plan_quiz(database, user_id, skill, quiz_details);
  const { questions } = await ai_provider.generate_quiz({
    skill_name: skill.name,
    topic: quiz_plan.ai_topic,
    topic_path: quiz_plan.scope === 'topic' ? format_topic_path(database, quiz_plan.topic_id) : null,
    source_text: quiz_plan.source_text,
    is_source_only: quiz_plan.is_source_only,
    question_count: quiz_details.question_count,
    learning_style: get_learning_style(database, user_id),
  });

  const quiz_id = randomUUID();
  database
    .prepare(
      `INSERT INTO quizzes (id, user_id, skill_id, skill_node_id, scope, resource_id, topic, questions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      quiz_id,
      user_id,
      skill.id,
      quiz_plan.topic_id,
      quiz_plan.scope,
      quiz_plan.resource_id,
      quiz_plan.topic,
      JSON.stringify(questions),
    );
  return to_public_quiz(get_owned_quiz(database, user_id, quiz_id));
}

export function delete_quiz(database, user_id, quiz_id) {
  const { changes } = database.prepare('DELETE FROM quizzes WHERE id = ? AND user_id = ?').run(quiz_id, user_id);
  if (changes === 0) throw create_http_error(HTTP_STATUS.not_found, 'Quiz not found');
}

// Instant feedback for one question, for students who chose "right after each question"
// in the learning style quiz. Saves nothing; the grade comes from submit_quiz_answers.
export function check_quiz_answer(quiz_row, question_index, answer_index) {
  const { correct_index, explanation } = JSON.parse(quiz_row.questions)[question_index];
  return { is_correct: answer_index === correct_index, correct_index, explanation };
}

// Grades answers (one choice index or null per question) against the questions.
// Returns { correct_count, total_count, score, question_results }, where score is a whole
// percent and question_results holds each question with the student's choice, the right
// answer and the explanation.
export function grade_quiz_answers(questions, answers) {
  const question_results = questions.map((quiz_question, question_index) => ({
    question: quiz_question.question,
    choices: quiz_question.choices,
    chosen_index: answers[question_index],
    correct_index: quiz_question.correct_index,
    is_correct: answers[question_index] === quiz_question.correct_index,
    explanation: quiz_question.explanation,
  }));
  const correct_count = question_results.filter((question_result) => question_result.is_correct).length;
  return {
    correct_count,
    total_count: questions.length,
    score: Math.round((correct_count / questions.length) * 100),
    question_results,
  };
}

// Grades answers and saves them as one quiz_results row. taker is "student" or
// "ai_student"; teach_session_id links the result to a lesson. Returns
// { result, question_results }.
export function save_quiz_result(database, { user_id, quiz_row, answers, taker, teach_session_id = null }) {
  const { correct_count, total_count, score, question_results } = grade_quiz_answers(JSON.parse(quiz_row.questions), answers);
  const result_id = randomUUID();
  database
    .prepare(
      `INSERT INTO quiz_results (id, user_id, quiz_id, teach_session_id, taker, answers, correct_count, total_count, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(result_id, user_id, quiz_row.id, teach_session_id, taker, JSON.stringify(answers), correct_count, total_count, score);
  const result = database
    .prepare('SELECT id, quiz_id, correct_count, total_count, score, completed_at FROM quiz_results WHERE id = ?')
    .get(result_id);
  return { result, question_results };
}

// Grades and saves the student's answers, updates the topic's mastery on the skill map,
// and returns { result, question_results, topic } where topic is the updated map topic
// (or null for a quiz not linked to one). teach_session_id is set for a lesson's quiz.
export function submit_quiz_answers(database, user_id, quiz_row, answers, teach_session_id = null) {
  const { result, question_results } = save_quiz_result(database, {
    user_id,
    quiz_row,
    answers,
    taker: 'student',
    teach_session_id,
  });
  let topic = null;
  if (quiz_row.skill_node_id) {
    update_topic_mastery(database, quiz_row.skill_node_id);
    topic = get_owned_topic(database, user_id, quiz_row.skill_node_id);
  }
  return { result, question_results, topic };
}

// The student's most recent quiz results in a skill, newest first.
export function list_recent_results(database, user_id, skill_id) {
  return database
    .prepare(
      `SELECT quiz_results.id, quiz_results.quiz_id, quizzes.topic, quizzes.skill_node_id AS topic_id,
              quiz_results.correct_count, quiz_results.total_count, quiz_results.score, quiz_results.completed_at
       FROM quiz_results JOIN quizzes ON quizzes.id = quiz_results.quiz_id
       WHERE quiz_results.user_id = ? AND quizzes.skill_id = ? AND quiz_results.taker = 'student'
       ORDER BY quiz_results.completed_at DESC, quiz_results.rowid DESC
       LIMIT ?`,
    )
    .all(user_id, skill_id, RECENT_RESULTS_LIMIT);
}
