import { useEffect } from 'react';
import { remember_skill_id } from '../utils/skill_selection.js';

// Remembers skill_id (when there is one) as the last skill chosen, each time it changes,
// so the next page opens on it too.
export function use_remembered_skill(skill_id) {
  useEffect(() => {
    if (skill_id) remember_skill_id(skill_id);
  }, [skill_id]);
}
