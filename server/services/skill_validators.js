import { HEX_COLOR_PATTERN, SKILL_NAME_MAX_LENGTH } from '../config/constants.js';

// Each validate_* function returns an error message, or null when the value is valid.

export function validate_skill_name(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'Skill name is required';
  if (name.trim().length > SKILL_NAME_MAX_LENGTH) {
    return `Skill name must be at most ${SKILL_NAME_MAX_LENGTH} characters`;
  }
  return null;
}

export function validate_skill_color(color) {
  if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) return 'Color must look like #4F46E5';
  return null;
}

const SKILL_FIELD_VALIDATORS = { name: validate_skill_name, color: validate_skill_color };

// Validates a new skill (name required, color optional) or, with is_partial, an edit
// (any fields present, at least one). Returns { field_errors, values } with name trimmed
// and color uppercased.
export function validate_skill_input(input, { is_partial = false } = {}) {
  const field_errors = {};
  const values = {};
  const fields_to_check = Object.keys(SKILL_FIELD_VALIDATORS).filter(
    (field_name) => input?.[field_name] !== undefined || (!is_partial && field_name === 'name'),
  );

  if (fields_to_check.length === 0) return { field_errors: { form: 'Nothing to update' }, values };

  for (const field_name of fields_to_check) {
    const error_message = SKILL_FIELD_VALIDATORS[field_name](input?.[field_name]);
    if (error_message) {
      field_errors[field_name] = error_message;
    } else {
      values[field_name] = field_name === 'name' ? input.name.trim() : input.color.toUpperCase();
    }
  }
  return { field_errors, values };
}
