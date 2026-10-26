import {
  GLOSSARY_DEFINITION_MAX_LENGTH,
  GLOSSARY_TERM_MAX_LENGTH,
  HTTP_STATUS,
  MAX_PRACTICE_HINTS,
} from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { is_valid_quiz_question } from './quiz_questions.js';

// Cleans up what a real AI returned for the learning features, so one malformed item
// doesn't break a whole lesson or practice set. Each normalize_* throws a 502 when
// nothing usable is left.

// The trimmed text, or '' for anything that isn't text.
export function clean_text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// The trimmed, non-empty strings in a list, at most max_count of them.
export function clean_text_list(values, max_count = Infinity) {
  return (Array.isArray(values) ? values : []).map(clean_text).filter(Boolean).slice(0, max_count);
}

// The trimmed text, or a 502 with message when it's missing.
export function require_text(value, message) {
  const text = clean_text(value);
  if (!text) throw create_http_error(HTTP_STATUS.bad_gateway, message);
  return text;
}

// A check question in quiz shape ({ question, choices, correct_index, explanation }), or
// null when it isn't a usable multiple-choice question.
export function normalize_check(raw_check) {
  if (!is_valid_quiz_question(raw_check)) return null;
  return {
    question: raw_check.question.trim(),
    choices: raw_check.choices.map((choice) => choice.trim()),
    correct_index: raw_check.correct_index,
    explanation: clean_text(raw_check.explanation),
  };
}

// A check question as it's stored in a lesson step: unanswered, after an optional
// re-explanation.
export function to_lesson_check(check, reteach_markdown = null) {
  return { reteach_markdown, ...check, chosen_index: null };
}

// The usable steps of a guided lesson (a title, an explanation and a valid check), at
// most step_count, each with its first check ready to answer.
export function normalize_lesson_steps(raw_steps, step_count) {
  const steps = [];
  for (const raw_step of Array.isArray(raw_steps) ? raw_steps : []) {
    const title = clean_text(raw_step?.title);
    const explanation_markdown = clean_text(raw_step?.explanation_markdown);
    const check = normalize_check(raw_step?.check);
    if (!title || !explanation_markdown || !check) continue;
    steps.push({
      title,
      explanation_markdown,
      example_markdown: clean_text(raw_step.example_markdown),
      checks: [to_lesson_check(check)],
    });
  }
  if (steps.length === 0) throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI did not return a usable lesson. Please try again.');
  return steps.slice(0, step_count);
}

// A re-explanation and its new check question.
export function normalize_reteach(ai_output) {
  const reteach_markdown = require_text(ai_output?.reteach_markdown, 'The AI did not explain it again. Please try again.');
  const check = normalize_check(ai_output?.check);
  if (!check) throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI did not return a usable question. Please try again.');
  return { reteach_markdown, check };
}

// The learning order as 0-based topic positions with reasons: [{ index, reason }]. Numbers
// out of range or used twice are dropped, and topics the AI left out go at the end in
// their original order, so every topic appears exactly once.
export function normalize_path_order(raw_steps, topic_count) {
  const ordered_steps = [];
  const used_indexes = new Set();
  for (const raw_step of Array.isArray(raw_steps) ? raw_steps : []) {
    const index = raw_step?.topic_number - 1;
    if (!Number.isInteger(index) || index < 0 || index >= topic_count || used_indexes.has(index)) continue;
    used_indexes.add(index);
    ordered_steps.push({ index, reason: clean_text(raw_step.reason) });
  }
  for (let index = 0; index < topic_count; index += 1) {
    if (!used_indexes.has(index)) ordered_steps.push({ index, reason: '' });
  }
  return ordered_steps;
}

// A practice set: { worked_example: { problem, steps, answer }, problems: [{ problem,
// hints, solution_steps, answer }] }, with at most problem_count problems and
// MAX_PRACTICE_HINTS hints each.
export function normalize_practice(ai_output, problem_count) {
  const raw_example = ai_output?.worked_example;
  const worked_example = {
    problem: clean_text(raw_example?.problem),
    steps: clean_text_list(raw_example?.steps),
    answer: clean_text(raw_example?.answer),
  };
  const problems = (Array.isArray(ai_output?.problems) ? ai_output.problems : [])
    .map((raw_problem) => ({
      problem: clean_text(raw_problem?.problem),
      hints: clean_text_list(raw_problem?.hints, MAX_PRACTICE_HINTS),
      solution_steps: clean_text_list(raw_problem?.solution_steps),
      answer: clean_text(raw_problem?.answer),
    }))
    .filter((practice_problem) => practice_problem.problem && practice_problem.answer && practice_problem.solution_steps.length > 0)
    .slice(0, problem_count);

  const has_example = worked_example.problem && worked_example.answer && worked_example.steps.length > 0;
  if (!has_example || problems.length === 0) {
    throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI did not return usable practice problems. Please try again.');
  }
  return { worked_example, problems };
}

// { is_correct, feedback }. Anything but a clear true counts as not correct yet.
export function normalize_practice_check(ai_output) {
  return {
    is_correct: ai_output?.is_correct === true,
    feedback: require_text(ai_output?.feedback, 'The AI did not check your answer. Please try again.'),
  };
}

export function normalize_reading_guide(ai_output) {
  return {
    explanation_markdown: require_text(ai_output?.explanation_markdown, 'The AI did not explain this section. Please try again.'),
    think_about: require_text(ai_output?.think_about, 'The AI did not explain this section. Please try again.'),
  };
}

export function normalize_explanation(ai_output) {
  return { explanation_markdown: require_text(ai_output?.explanation_markdown, 'The AI did not explain it. Please try again.') };
}

// Key terms: trimmed, not too long, no repeats (ignoring letter case), at most max_terms.
// Over-long definitions are cut rather than dropped.
export function normalize_glossary_terms(raw_terms, max_terms) {
  const seen_terms = new Set();
  const terms = [];
  for (const raw_term of Array.isArray(raw_terms) ? raw_terms : []) {
    const term = clean_text(raw_term?.term);
    const definition = clean_text(raw_term?.definition).slice(0, GLOSSARY_DEFINITION_MAX_LENGTH);
    if (!term || !definition || term.length > GLOSSARY_TERM_MAX_LENGTH || seen_terms.has(term.toLowerCase())) continue;
    seen_terms.add(term.toLowerCase());
    terms.push({ term, definition, topic: clean_text(raw_term.topic) });
  }
  if (terms.length === 0) throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI did not find any key terms. Please try again.');
  return terms.slice(0, max_terms);
}
