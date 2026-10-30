import { GraduationCap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AI_STUDENT_NAME, ROUTE_PATHS } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { use_remembered_skill } from '../../hooks/use_remembered_skill.js';
import { fetch_skills } from '../../services/skill_service.js';
import { start_teach_session } from '../../services/teach_service.js';
import { fetch_topic_map } from '../../services/topic_service.js';
import { find_selected_skill } from '../../utils/skill_selection.js';
import { build_topic_tree, flatten_topic_tree, format_indented_name } from '../../utils/topic_tree.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import FormField from '../FormField.jsx';
import LessonHistory from './LessonHistory.jsx';

// The topic select's value for "type my own topic".
export const CUSTOM_LESSON_TOPIC = '__custom__';

// The request body for a new lesson: a map topic by id, or a typed topic.
export function build_lesson_details(topic_choice, custom_topic) {
  return topic_choice === CUSTOM_LESSON_TOPIC ? { topic: custom_topic } : { topic_id: topic_choice };
}

// Picks what to teach: a skill and one of its topics (at any level) or a typed topic, then
// starts the lesson (on_started(teach_session)). Below, the skill's past lessons, which
// on_open_lesson(session_id) reopens.
function TeachSetup({ initial_skill_id, initial_topic_id, on_started, on_open_lesson }) {
  const skills_state = use_api_data(fetch_skills, []);
  const [skill_id, set_skill_id] = useState(initial_skill_id ?? '');
  const [topic_choice, set_topic_choice] = useState(initial_topic_id ?? '');
  const [custom_topic, set_custom_topic] = useState('');
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_starting, set_is_starting] = useState(false);

  const skills = skills_state.data ?? [];
  // The topics are tagged with their skill, so a list still showing from before (no skill,
  // or the previous skill) is never taken for the chosen skill's.
  const topic_map_state = use_api_data(
    () => (skill_id ? fetch_topic_map(skill_id).then(({ topics }) => ({ skill_id, topics })) : Promise.resolve(null)),
    [skill_id],
  );
  const topic_nodes = flatten_topic_tree(build_topic_tree(topic_map_state.data?.topics ?? []));

  // Once skills load, choose the last skill picked on any page (or the first), unless one was given.
  useEffect(() => {
    if (!skill_id && skills.length > 0) set_skill_id(find_selected_skill(skills, null).id);
  }, [skill_id, skills]);
  use_remembered_skill(skill_id);

  // Once the chosen skill's topics arrive, fall back to the first topic (or typing one)
  // when nothing valid is chosen.
  const has_loaded_topics = Boolean(skill_id) && topic_map_state.data?.skill_id === skill_id;
  useEffect(() => {
    if (!has_loaded_topics) return;
    const has_choice = topic_nodes.some((tree_node) => tree_node.topic.id === topic_choice);
    if (topic_choice !== CUSTOM_LESSON_TOPIC && !has_choice) {
      set_topic_choice(topic_nodes[0]?.topic.id ?? CUSTOM_LESSON_TOPIC);
    }
  }, [has_loaded_topics, topic_nodes, topic_choice]);

  async function handle_start(submit_event) {
    submit_event.preventDefault();
    set_is_starting(true);
    set_form_error('');
    set_field_errors({});
    try {
      on_started(await start_teach_session(skill_id, build_lesson_details(topic_choice, custom_topic)));
    } catch (start_error) {
      set_field_errors(start_error.field_errors ?? {});
      set_form_error(start_error.message);
      set_is_starting(false);
    }
  }

  if (skills_state.is_loading) return <p className="text-small text-ink-muted">Loading your skills…</p>;
  if (skills.length === 0) {
    return (
      <p className="text-body text-ink">
        Add a skill on the{' '}
        <Link to={`${ROUTE_PATHS.dashboard}/skill-map`} className="font-semibold text-brand-700 underline">
          skill map
        </Link>{' '}
        first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handle_start} noValidate className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-heading-3 font-semibold text-ink">Start a lesson</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="teach-skill" className="text-small font-semibold text-ink">
              Skill
            </label>
            <select
              id="teach-skill"
              value={skill_id}
              onChange={(change_event) => {
                set_skill_id(change_event.target.value);
                set_topic_choice('');
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
            >
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="teach-topic" className="text-small font-semibold text-ink">
              Topic to teach
            </label>
            <select
              id="teach-topic"
              value={topic_choice}
              onChange={(change_event) => set_topic_choice(change_event.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
            >
              {topic_nodes.map((tree_node) => (
                <option key={tree_node.topic.id} value={tree_node.topic.id}>
                  {format_indented_name(tree_node)}
                </option>
              ))}
              <option value={CUSTOM_LESSON_TOPIC}>Type my own topic…</option>
            </select>
          </div>
        </div>
        {topic_choice === CUSTOM_LESSON_TOPIC && (
          <FormField
            field_id="teach-custom-topic"
            label="Your topic"
            placeholder="e.g. The water cycle"
            value={custom_topic}
            on_change={set_custom_topic}
            error={field_errors.topic}
          />
        )}
        {form_error && <AlertMessage>{form_error}</AlertMessage>}
        <button
          type="submit"
          disabled={is_starting || !skill_id || !topic_choice}
          className={get_button_classes('primary', 'self-start')}
        >
          <GraduationCap aria-hidden="true" className="h-4 w-4" />
          {is_starting ? 'Starting…' : `Start teaching ${AI_STUDENT_NAME}`}
        </button>
      </form>

      {skill_id && (
        <section aria-labelledby="lesson-history-heading" className="flex flex-col gap-3">
          <h2 id="lesson-history-heading" className="text-heading-3 font-semibold text-ink">
            Your lessons
          </h2>
          <LessonHistory skill_id={skill_id} on_open={on_open_lesson} />
        </section>
      )}
    </div>
  );
}

export default TeachSetup;
