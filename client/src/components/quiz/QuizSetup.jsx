import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ROUTE_PATHS } from '../../config/constants.js';
import { describe_mastery } from '../../config/mastery.js';
import { QUIZ_QUESTION_COUNT } from '../../config/resource_types.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { use_remembered_skill } from '../../hooks/use_remembered_skill.js';
import { fetch_resources } from '../../services/resource_service.js';
import { fetch_skills } from '../../services/skill_service.js';
import { generate_quiz } from '../../services/study_material_service.js';
import { fetch_topic_map } from '../../services/topic_service.js';
import { find_selected_skill } from '../../utils/skill_selection.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import FormField from '../FormField.jsx';

// The "What to quiz on" select's values: the whole skill, "topic:<id>", "resource:<id>",
// or a typed topic.
export const WHOLE_SKILL_CHOICE = 'skill';
export const CUSTOM_TOPIC_CHOICE = 'custom';
const TOPIC_CHOICE_PREFIX = 'topic:';
const RESOURCE_CHOICE_PREFIX = 'resource:';

export function topic_choice(topic_id) {
  return `${TOPIC_CHOICE_PREFIX}${topic_id}`;
}

export function resource_choice(resource_id) {
  return `${RESOURCE_CHOICE_PREFIX}${resource_id}`;
}

// The choice to start on: a resource or topic picked elsewhere (e.g. on the skill map), or none yet.
export function get_initial_choice(initial_topic_id, initial_resource_id) {
  if (initial_resource_id) return resource_choice(initial_resource_id);
  if (initial_topic_id) return topic_choice(initial_topic_id);
  return '';
}

// True when choice is still one of the options for the loaded topics and resources.
export function is_available_choice(choice, topics, resources) {
  if (choice === WHOLE_SKILL_CHOICE || choice === CUSTOM_TOPIC_CHOICE) return true;
  return (
    topics.some((topic) => choice === topic_choice(topic.id)) ||
    resources.some((resource) => choice === resource_choice(resource.id))
  );
}

// The request body for a new quiz from the chosen option.
export function build_quiz_details(choice, custom_topic, question_count) {
  if (choice === WHOLE_SKILL_CHOICE) return { scope: 'skill', question_count };
  if (choice === CUSTOM_TOPIC_CHOICE) return { scope: 'topic', topic: custom_topic, question_count };
  if (choice.startsWith(RESOURCE_CHOICE_PREFIX)) {
    return { scope: 'resource', resource_id: choice.slice(RESOURCE_CHOICE_PREFIX.length), question_count };
  }
  return { scope: 'topic', topic_id: choice.slice(TOPIC_CHOICE_PREFIX.length), question_count };
}

// Picks what to quiz on: a skill, then the whole skill, one of its topics, one resource or
// a typed topic, and how many questions. initial_skill_id, initial_topic_id and
// initial_resource_id preselect a choice, e.g. from the skill map. on_quiz_ready(quiz)
// runs once the quiz is made.
function QuizSetup({ initial_skill_id, initial_topic_id, initial_resource_id, on_quiz_ready }) {
  const skills_state = use_api_data(fetch_skills, []);
  const [skill_id, set_skill_id] = useState(initial_skill_id ?? '');
  const [choice, set_choice] = useState(get_initial_choice(initial_topic_id, initial_resource_id));
  const [custom_topic, set_custom_topic] = useState('');
  const [question_count, set_question_count] = useState(QUIZ_QUESTION_COUNT.default);
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_generating, set_is_generating] = useState(false);

  const skills = skills_state.data ?? [];
  const selected_skill = skills.find((skill) => skill.id === skill_id) ?? null;
  // The skill's topics and resources come back tagged with the skill, so lists still showing
  // from before (no skill, or the previous skill) are never taken for the chosen skill's.
  const choices_state = use_api_data(
    () =>
      skill_id
        ? Promise.all([fetch_topic_map(skill_id), fetch_resources(skill_id)]).then(([topic_map, skill_resources]) => ({
            skill_id,
            topics: topic_map.topics,
            resources: skill_resources,
          }))
        : Promise.resolve(null),
    [skill_id],
  );
  const has_loaded_choices = Boolean(skill_id) && choices_state.data?.skill_id === skill_id;
  const topics = has_loaded_choices ? choices_state.data.topics : [];
  const resources = has_loaded_choices ? choices_state.data.resources : [];

  // Once skills load, choose the last skill picked on any page (or the first), unless one was given.
  useEffect(() => {
    if (!skill_id && skills.length > 0) set_skill_id(find_selected_skill(skills, null).id);
  }, [skill_id, skills]);
  use_remembered_skill(skill_id);

  // Once the skill's topics and resources load, fall back to its first topic (or the whole
  // skill) if nothing valid is chosen.
  useEffect(() => {
    if (!has_loaded_choices || is_available_choice(choice, topics, resources)) return;
    set_choice(topics.length > 0 ? topic_choice(topics[0].id) : WHOLE_SKILL_CHOICE);
  }, [has_loaded_choices, choice, topics, resources]);

  function choose_skill(new_skill_id) {
    set_skill_id(new_skill_id);
    set_choice('');
  }

  async function handle_start(submit_event) {
    submit_event.preventDefault();
    set_is_generating(true);
    set_form_error('');
    set_field_errors({});
    try {
      on_quiz_ready(await generate_quiz(skill_id, build_quiz_details(choice, custom_topic, question_count)));
    } catch (generate_error) {
      set_field_errors(generate_error.field_errors ?? {});
      set_form_error(generate_error.message);
      set_is_generating(false);
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
    <form onSubmit={handle_start} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="quiz-skill" className="text-small font-semibold text-ink">
            Skill
          </label>
          <select
            id="quiz-skill"
            value={skill_id}
            onChange={(change_event) => choose_skill(change_event.target.value)}
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
          <label htmlFor="quiz-choice" className="text-small font-semibold text-ink">
            What to quiz on
          </label>
          <select
            id="quiz-choice"
            value={choice}
            onChange={(change_event) => set_choice(change_event.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
          >
            {!has_loaded_choices && <option value={choice}>Loading…</option>}
            <option value={WHOLE_SKILL_CHOICE}>Everything in {selected_skill?.name ?? 'this skill'}</option>
            {topics.length > 0 && (
              <optgroup label="Topics">
                {topics.map((topic) => (
                  <option key={topic.id} value={topic_choice(topic.id)}>
                    {topic.topic} ({describe_mastery(topic)})
                  </option>
                ))}
              </optgroup>
            )}
            {resources.length > 0 && (
              <optgroup label="One resource">
                {resources.map((resource) => (
                  <option key={resource.id} value={resource_choice(resource.id)}>
                    {resource.title}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={CUSTOM_TOPIC_CHOICE}>Type my own topic…</option>
          </select>
        </div>
      </div>

      {choice === CUSTOM_TOPIC_CHOICE && (
        <FormField
          field_id="quiz-custom-topic"
          label="Your topic"
          placeholder="e.g. Photosynthesis"
          value={custom_topic}
          on_change={set_custom_topic}
          error={field_errors.topic}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="quiz-setup-count" className="text-small font-semibold text-ink">
          Number of questions
        </label>
        <input
          id="quiz-setup-count"
          type="number"
          min={QUIZ_QUESTION_COUNT.min}
          max={QUIZ_QUESTION_COUNT.max}
          value={question_count}
          onChange={(change_event) => set_question_count(Number(change_event.target.value))}
          className="w-24 rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
        />
      </div>

      {selected_skill?.resource_count === 0 && (
        <p className="text-small text-ink-muted">
          {selected_skill.name} has no resources yet, so the questions will come from the AI's general knowledge.
        </p>
      )}
      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      <button
        type="submit"
        disabled={is_generating || !skill_id || !choice}
        className={get_button_classes('primary', 'self-start')}
      >
        {is_generating ? 'Writing your quiz…' : 'Start quiz'}
      </button>
    </form>
  );
}

export default QuizSetup;
