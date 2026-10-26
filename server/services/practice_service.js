import { randomUUID } from 'node:crypto';
import { HTTP_STATUS, RECENT_LEARNING_ITEMS_LIMIT } from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { get_learning_style } from './learning_profile_service.js';
import { resolve_quiz_topic } from './quiz_service.js';
import { get_owned_skill } from './skill_service.js';
import { get_topic_source_text } from './topic_resource_service.js';
import { format_topic_path } from './topic_service.js';

// Practice with hints: a worked example, then problems the student solves themselves.
// Hints come one at a time, each giving away a little more; the full solution can be shown
// whenever the student wants it. Nothing is graded and the skill map doesn't change: this
// is for learning, and quizzes are for checking.

const PRACTICE_COLUMNS = 'id, user_id, skill_id, skill_node_id, topic, worked_example, problems, created_at';

export function is_problem_solved(practice_problem) {
  return practice_problem.attempts.some((attempt) => attempt.is_correct);
}

// A problem as the client sees it: only the hints shown so far, and the solution only once
// the student asks for it.
export function to_public_problem(practice_problem) {
  const is_solution_shown = practice_problem.is_solution_shown;
  return {
    problem: practice_problem.problem,
    hints: practice_problem.hints.slice(0, practice_problem.hints_shown),
    hint_count: practice_problem.hints.length,
    attempts: practice_problem.attempts,
    is_solved: is_problem_solved(practice_problem),
    is_solution_shown,
    solution_steps: is_solution_shown ? practice_problem.solution_steps : null,
    answer: is_solution_shown ? practice_problem.answer : null,
  };
}

export function to_practice_set(practice_row) {
  const problems = JSON.parse(practice_row.problems);
  return {
    id: practice_row.id,
    skill_id: practice_row.skill_id,
    topic_id: practice_row.skill_node_id,
    topic: practice_row.topic,
    created_at: practice_row.created_at,
    worked_example: JSON.parse(practice_row.worked_example),
    problems: problems.map(to_public_problem),
    solved_count: problems.filter(is_problem_solved).length,
  };
}

export function get_owned_practice_set(database, user_id, practice_id) {
  const practice_row = database.prepare(`SELECT ${PRACTICE_COLUMNS} FROM practice_sets WHERE id = ? AND user_id = ?`).get(practice_id, user_id);
  if (!practice_row) throw create_http_error(HTTP_STATUS.not_found, 'Practice set not found');
  return practice_row;
}

// The skill's practice sets, newest first: [{ id, topic_id, topic, problem_count, solved_count, created_at }].
export function list_practice_sets(database, user_id, skill_id, limit = RECENT_LEARNING_ITEMS_LIMIT) {
  return database
    .prepare(
      `SELECT id, skill_node_id AS topic_id, topic, problems, created_at FROM practice_sets
       WHERE user_id = ? AND skill_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(user_id, skill_id, limit)
    .map(({ problems, ...practice_summary }) => {
      const parsed_problems = JSON.parse(problems);
      return { ...practice_summary, problem_count: parsed_problems.length, solved_count: parsed_problems.filter(is_problem_solved).length };
    });
}

// Asks the AI for a worked example and problems on a map topic or a typed topic, and saves
// them with no hints shown. practice_details: { topic, topic_id, problem_count }.
export async function create_practice_set({ database, ai_provider, user_id, skill, practice_details }) {
  const { topic, topic_id, search_text } = resolve_quiz_topic(database, user_id, skill.id, practice_details);
  const { worked_example, problems } = await ai_provider.generate_practice({
    skill_name: skill.name,
    topic,
    topic_path: format_topic_path(database, topic_id),
    source_text: get_topic_source_text(database, user_id, skill.id, { search_text, topic_id }),
    problem_count: practice_details.problem_count,
    learning_style: get_learning_style(database, user_id),
  });
  const saved_problems = problems.map((practice_problem) => ({
    ...practice_problem,
    hints_shown: 0,
    is_solution_shown: false,
    attempts: [],
  }));
  const practice_id = randomUUID();
  database
    .prepare('INSERT INTO practice_sets (id, user_id, skill_id, skill_node_id, topic, worked_example, problems) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(practice_id, user_id, skill.id, topic_id, topic, JSON.stringify(worked_example), JSON.stringify(saved_problems));
  return to_practice_set(get_owned_practice_set(database, user_id, practice_id));
}

// The problems and the one at problem_index, or a 404 when there's no such problem.
export function find_problem(practice_row, problem_index) {
  const problems = JSON.parse(practice_row.problems);
  if (!Number.isInteger(problem_index) || !problems[problem_index]) throw create_http_error(HTTP_STATUS.not_found, 'Problem not found');
  return { problems, practice_problem: problems[problem_index] };
}

function save_problems(database, practice_row, problems) {
  database.prepare('UPDATE practice_sets SET problems = ? WHERE id = ?').run(JSON.stringify(problems), practice_row.id);
}

// Shows the next hint.
export function reveal_hint({ database, user_id, practice_row, problem_index }) {
  const { problems, practice_problem } = find_problem(practice_row, problem_index);
  if (practice_problem.hints_shown >= practice_problem.hints.length) {
    throw create_http_error(HTTP_STATUS.conflict, "There are no more hints. Show the solution when you're ready.");
  }
  practice_problem.hints_shown += 1;
  save_problems(database, practice_row, problems);
  return to_practice_set(get_owned_practice_set(database, user_id, practice_row.id));
}

// Shows the full solution and answer.
export function reveal_solution({ database, user_id, practice_row, problem_index }) {
  const { problems, practice_problem } = find_problem(practice_row, problem_index);
  practice_problem.is_solution_shown = true;
  save_problems(database, practice_row, problems);
  return to_practice_set(get_owned_practice_set(database, user_id, practice_row.id));
}

// Has the AI check a typed answer and saves the attempt with its feedback. A solved
// problem isn't checked again. Returns { practice_set, attempt }.
export async function check_practice_answer({ database, ai_provider, user_id, practice_row, problem_index, answer }) {
  const { problems, practice_problem } = find_problem(practice_row, problem_index);
  if (is_problem_solved(practice_problem)) throw create_http_error(HTTP_STATUS.conflict, "You've already solved this one.");
  const { is_correct, feedback } = await ai_provider.check_practice_answer({
    skill_name: get_owned_skill(database, user_id, practice_row.skill_id).name,
    topic: practice_row.topic,
    topic_path: format_topic_path(database, practice_row.skill_node_id),
    problem: practice_problem.problem,
    answer: practice_problem.answer,
    solution_steps: practice_problem.solution_steps,
    student_answer: answer,
  });
  const attempt = { answer, is_correct, feedback };
  practice_problem.attempts.push(attempt);
  save_problems(database, practice_row, problems);
  return { practice_set: to_practice_set(get_owned_practice_set(database, user_id, practice_row.id)), attempt };
}

export function delete_practice_set(database, user_id, practice_id) {
  get_owned_practice_set(database, user_id, practice_id);
  database.prepare('DELETE FROM practice_sets WHERE id = ?').run(practice_id);
}
