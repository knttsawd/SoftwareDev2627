import { SELECTED_SKILL_STORAGE_KEY } from '../config/constants.js';
import { read_device_value, save_device_value } from './device_storage.js';

// Pages that work on one skill at a time (Skill map, Learn) keep the chosen skill in the
// address as ?skill=<id>, so a refresh or a shared link keeps it. The last skill chosen on
// any page is also remembered on this device, so moving between pages stays on it.
export const SELECTED_SKILL_PARAM = 'skill';

export function remember_skill_id(skill_id) {
  save_device_value(SELECTED_SKILL_STORAGE_KEY, skill_id);
}

// The chosen skill: the one named in the address if it exists, otherwise the last one
// chosen, otherwise the first.
export function find_selected_skill(skills, requested_skill_id) {
  const remembered_skill_id = read_device_value(SELECTED_SKILL_STORAGE_KEY);
  return (
    skills.find((skill) => skill.id === requested_skill_id) ??
    skills.find((skill) => skill.id === remembered_skill_id) ??
    skills[0] ??
    null
  );
}
