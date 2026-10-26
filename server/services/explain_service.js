import { EXPLAIN_SOURCE_CHARACTERS } from '../config/constants.js';
import { get_learning_style } from './learning_profile_service.js';
import { get_topic_source_text, resolve_resource_topic_id } from './topic_resource_service.js';
import { format_topic_path } from './topic_service.js';

// "Explain another way": rewrites any explanation the student is reading (a note, a topic,
// a lesson step, a reading guide) in the style they ask for (EXPLAIN_STYLES). Nothing is
// saved: it's a quick extra explanation. The skill's resources about the same thing, or
// those filed under topic_id first, give the AI material to build on.
export async function explain_another_way({ database, ai_provider, user_id, skill, explain_details }) {
  const { text, style, topic_id } = explain_details;
  const checked_topic_id = resolve_resource_topic_id(database, user_id, skill.id, topic_id);
  return ai_provider.explain_text({
    skill_name: skill.name,
    topic_path: format_topic_path(database, checked_topic_id),
    text,
    style,
    context_text: get_topic_source_text(database, user_id, skill.id, {
      search_text: text,
      topic_id: checked_topic_id,
      max_characters: EXPLAIN_SOURCE_CHARACTERS,
    }),
    learning_style: get_learning_style(database, user_id),
  });
}
