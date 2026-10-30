import {
  QUIZ_QUESTION_COUNT,
  QUIZ_SCOPES,
  TEACH_MESSAGE_MAX_LENGTH,
  TEACH_QUIZ_QUESTION_COUNT,
  TOPIC_MAX_LENGTH,
} from '../config/constants.js';

// Each validate_* function returns an error message, or null when the value is valid.
// Each validate_*_input function returns { field_errors, values }.

export function validate_topic(topic) {
  if (typeof topic !== 'string' || topic.trim() === '') return 'Topic is required';
  if (topic.trim().length > TOPIC_MAX_LENGTH) return `Topic must be at most ${TOPIC_MAX_LENGTH} characters`;
  return null;
}

// Missing means "use the default"; anything sent must be a whole number in range.
export function validate_question_count(question_count) {
  if (question_count === undefined) return null;
  if (!Number.isInteger(question_count) || question_count < QUIZ_QUESTION_COUNT.min || question_count > QUIZ_QUESTION_COUNT.max) {
    return `Choose between ${QUIZ_QUESTION_COUNT.min} and ${QUIZ_QUESTION_COUNT.max} questions`;
  }
  return null;
}

// Ids are optional; when sent they must be non-empty text.
export function validate_optional_id(id_value) {
  if (id_value === undefined || id_value === null) return null;
  return typeof id_value === 'string' && id_value.trim() !== '' ? null : 'Choose an item from the list';
}

export function validate_notes_input(input) {
  const topic_error = validate_topic(input?.topic);
  if (topic_error) return { field_errors: { topic: topic_error }, values: {} };
  return { field_errors: {}, values: { topic: input.topic.trim() } };
}

export function validate_required_id(id_value) {
  return typeof id_value === 'string' && id_value.trim() !== '' ? null : 'Choose an item from the list';
}

// Errors for the details each quiz scope needs: a map topic (topic_id) or a typed topic
// for "topic", a resource_id for "resource", and nothing more for "skill".
export function find_quiz_scope_errors(scope, input) {
  if (!QUIZ_SCOPES.includes(scope)) return { scope: 'Choose what to quiz on' };
  const scope_errors = {};
  if (scope === 'topic') {
    const topic_id_error = validate_optional_id(input?.topic_id);
    const topic_error = input?.topic_id ? null : validate_topic(input?.topic);
    if (topic_error) scope_errors.topic = topic_error;
    if (topic_id_error) scope_errors.topic_id = topic_id_error;
  }
  if (scope === 'resource') {
    const resource_error = validate_required_id(input?.resource_id);
    if (resource_error) scope_errors.resource_id = resource_error;
  }
  return scope_errors;
}

// A new quiz: { scope? ("topic" by default), topic?, topic_id?, resource_id?, question_count? }.
// Only the details that belong to the scope are kept.
export function validate_quiz_input(input) {
  const scope = input?.scope ?? 'topic';
  const field_errors = find_quiz_scope_errors(scope, input);
  const count_error = validate_question_count(input?.question_count);
  if (count_error) field_errors.question_count = count_error;
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return {
    field_errors,
    values: {
      scope,
      topic: scope === 'topic' && typeof input.topic === 'string' ? input.topic.trim() : null,
      topic_id: scope === 'topic' ? (input.topic_id ?? null) : null,
      resource_id: scope === 'resource' ? input.resource_id : null,
      question_count: input.question_count ?? QUIZ_QUESTION_COUNT.default,
    },
  };
}

// Filing a resource under a topic: { topic_id } with a topic's id, or null for no topic.
export function validate_resource_topic_input(input) {
  if (input?.topic_id === undefined) return { field_errors: { topic_id: 'Choose a topic' }, values: {} };
  const topic_id_error = validate_optional_id(input.topic_id);
  if (topic_id_error) return { field_errors: { topic_id: topic_id_error }, values: {} };
  return { field_errors: {}, values: { topic_id: input.topic_id } };
}

// A topic added by hand: { topic, parent_topic_id? }.
export function validate_topic_input(input) {
  const field_errors = {};
  const topic_error = validate_topic(input?.topic);
  const parent_error = validate_optional_id(input?.parent_topic_id);
  if (topic_error) field_errors.topic = topic_error;
  if (parent_error) field_errors.parent_topic_id = parent_error;
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return { field_errors, values: { topic: input.topic.trim(), parent_topic_id: input.parent_topic_id ?? null } };
}

// A new lesson is on a map topic (topic_id) or a typed topic: { topic_id?, topic? }.
export function validate_teach_session_input(input) {
  const field_errors = find_quiz_scope_errors('topic', input);
  if (Object.keys(field_errors).length > 0) return { field_errors, values: {} };
  return {
    field_errors,
    values: { topic: typeof input.topic === 'string' ? input.topic.trim() : null, topic_id: input.topic_id ?? null },
  };
}

// One explanation to the AI student, up to TEACH_MESSAGE_MAX_LENGTH characters.
export function validate_teach_message(message) {
  if (typeof message !== 'string' || message.trim() === '') return 'Write or say an explanation first';
  if (message.trim().length > TEACH_MESSAGE_MAX_LENGTH) {
    return `Keep each explanation under ${TEACH_MESSAGE_MAX_LENGTH} characters`;
  }
  return null;
}

// The lesson quiz's length: missing means the default; otherwise a whole number in range.
export function validate_teach_question_count(question_count) {
  if (question_count === undefined) return null;
  const { min, max } = TEACH_QUIZ_QUESTION_COUNT;
  if (!Number.isInteger(question_count) || question_count < min || question_count > max) {
    return `Choose between ${min} and ${max} questions`;
  }
  return null;
}

// Renaming or moving a topic: { topic?, parent_topic_id? }, at least one. parent_topic_id
// null moves the topic to the top level.
export function validate_topic_update_input(input) {
  const has_topic = input?.topic !== undefined;
  const has_parent = input?.parent_topic_id !== undefined;
  if (!has_topic && !has_parent) return { field_errors: { form: 'Nothing to update' }, values: {} };
  const field_errors = {};
  const values = {};
  if (has_topic) {
    const topic_error = validate_topic(input.topic);
    if (topic_error) field_errors.topic = topic_error;
    else values.topic = input.topic.trim();
  }
  if (has_parent) {
    const parent_error = validate_optional_id(input.parent_topic_id);
    if (parent_error) field_errors.parent_topic_id = parent_error;
    else values.parent_topic_id = input.parent_topic_id;
  }
  return { field_errors, values };
}

// True when answer is null (skipped) or a choice index that exists for the question.
export function is_valid_answer(answer, quiz_question) {
  return answer === null || (Number.isInteger(answer) && answer >= 0 && answer < quiz_question.choices.length);
}

// answers must hold one entry per question: a choice index, or null for a skipped question.
// Returns an error message or null.
export function validate_quiz_answers(answers, questions) {
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    return `Send one answer for each of the ${questions.length} questions`;
  }
  if (!answers.every((answer, question_index) => is_valid_answer(answer, questions[question_index]))) {
    return 'Each answer must be one of the choices, or null to skip';
  }
  return null;
}

// { question_index, answer_index } for checking one answer. Returns an error message or null.
export function validate_answer_check(input, questions) {
  const question_index = input?.question_index;
  if (!Number.isInteger(question_index) || question_index < 0 || question_index >= questions.length) {
    return 'Choose a question from this quiz';
  }
  if (input.answer_index === null || !is_valid_answer(input.answer_index, questions[question_index])) {
    return 'Choose one of the answers';
  }
  return null;
}
