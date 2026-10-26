import {
  EXPLAIN_STYLES,
  EXPLAIN_TEXT_MAX_LENGTH,
  GLOSSARY_DEFINITION_MAX_LENGTH,
  GLOSSARY_TERM_MAX_LENGTH,
  LESSON_STEP_COUNT,
  PRACTICE_ANSWER_MAX_LENGTH,
  PRACTICE_PROBLEM_COUNT,
  QUIZ_CHOICE_COUNT,
  READING_PASSAGE_MAX_LENGTH,
} from '../config/constants.js';
import { validate_optional_id, validate_teach_session_input } from './study_validators.js';

// Checks for the learning features' requests. Like study_validators.js, each validate_*
// returns an error message or null, and each validate_*_input returns { field_errors, values }.

// Missing means "use the default"; anything sent must be a whole number within limits.
// noun names what's counted, e.g. "steps".
export function validate_count(count, limits, noun) {
  if (count === undefined) return null;
  if (!Number.isInteger(count) || count < limits.min || count > limits.max) {
    return `Choose between ${limits.min} and ${limits.max} ${noun}`;
  }
  return null;
}

// Required text up to max_length characters. empty_message is shown when it's blank.
export function validate_text(text, max_length, empty_message) {
  if (typeof text !== 'string' || text.trim() === '') return empty_message;
  if (text.trim().length > max_length) return `Keep it under ${max_length} characters`;
  return null;
}

// What to learn or practise (a map topic or a typed one) and how much of it:
// { topic_id? | topic, <count_field>? }, with the count defaulting to limits.default.
export function validate_topic_with_count(input, count_field, limits, noun) {
  const { field_errors, values } = validate_teach_session_input(input);
  const count_error = validate_count(input?.[count_field], limits, noun);
  if (count_error) field_errors[count_field] = count_error;
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return { field_errors, values: { ...values, [count_field]: input[count_field] ?? limits.default } };
}

// A new guided lesson: { topic_id? | topic, step_count? }.
export function validate_lesson_input(input) {
  return validate_topic_with_count(input, 'step_count', LESSON_STEP_COUNT, 'steps');
}

// A new practice set: { topic_id? | topic, problem_count? }.
export function validate_practice_input(input) {
  return validate_topic_with_count(input, 'problem_count', PRACTICE_PROBLEM_COUNT, 'problems');
}

// An answer to a check question: one of the choice positions.
export function validate_choice_index(choice_index) {
  if (!Number.isInteger(choice_index) || choice_index < 0 || choice_index >= QUIZ_CHOICE_COUNT) return 'Choose one of the answers';
  return null;
}

export function validate_practice_answer(answer) {
  return validate_text(answer, PRACTICE_ANSWER_MAX_LENGTH, 'Type an answer first');
}

// A passage picked while reading, to be explained: { passage, section_index }.
export function validate_passage(passage) {
  return validate_text(passage, READING_PASSAGE_MAX_LENGTH, 'Select or type the part you want explained');
}

// "Explain another way": { text, style, topic_id? }.
export function validate_explain_input(input) {
  const field_errors = {};
  const text_error = validate_text(input?.text, EXPLAIN_TEXT_MAX_LENGTH, 'Nothing to explain');
  const topic_error = validate_optional_id(input?.topic_id);
  if (text_error) field_errors.text = text_error;
  if (!EXPLAIN_STYLES.includes(input?.style)) field_errors.style = `Choose one of: ${EXPLAIN_STYLES.join(', ')}`;
  if (topic_error) field_errors.topic_id = topic_error;
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return { field_errors, values: { text: input.text.trim(), style: input.style, topic_id: input.topic_id ?? null } };
}

// A key term added by hand: { term, definition, topic_id? }.
export function validate_glossary_term_input(input) {
  const field_errors = {};
  const term_error = validate_text(input?.term, GLOSSARY_TERM_MAX_LENGTH, 'Term is required');
  const definition_error = validate_text(input?.definition, GLOSSARY_DEFINITION_MAX_LENGTH, 'Definition is required');
  const topic_error = validate_optional_id(input?.topic_id);
  if (term_error) field_errors.term = term_error;
  if (definition_error) field_errors.definition = definition_error;
  if (topic_error) field_errors.topic_id = topic_error;
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return {
    field_errors,
    values: { term: input.term.trim(), definition: input.definition.trim(), topic_id: input.topic_id ?? null },
  };
}
