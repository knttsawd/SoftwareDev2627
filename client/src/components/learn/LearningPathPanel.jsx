import { ArrowRight, BookOpenCheck, Circle, CircleCheck, ClipboardCheck, Dumbbell, Route } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { LESSON_STEP_COUNT } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { build_learning_path, fetch_learning_path, start_guided_lesson } from '../../services/learning_service.js';
import { build_learn_path, build_quiz_path } from '../../utils/study_paths.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';

// How each step's status looks. The label always says it in words; the icon and color repeat it.
export const PATH_STATUS_DETAILS = {
  done: { label: 'Done', icon: CircleCheck, text_classes: 'text-success', card_classes: 'border-border' },
  next: { label: 'Next up', icon: ArrowRight, text_classes: 'text-brand-700', card_classes: 'border-brand-600 ring-1 ring-brand-600' },
  todo: { label: 'To do', icon: Circle, text_classes: 'text-ink-muted', card_classes: 'border-border' },
};

export function count_done_steps(path_steps) {
  return path_steps.filter((path_step) => path_step.status === 'done').length;
}

// The lesson button for a step: continue an unfinished lesson, or start one (again).
export function get_lesson_action(path_step) {
  const lesson = path_step.lesson;
  if (lesson && !lesson.is_latest_complete) return { label: 'Continue lesson', lesson_id: lesson.latest_lesson_id };
  return { label: lesson?.has_finished ? 'Learn it again' : 'Start lesson', lesson_id: null };
}

// "2 new topics were added since this path was made. Reorder to fit them in."
export function describe_new_topics(new_topic_count) {
  if (new_topic_count === 0) return '';
  const topic_words = new_topic_count === 1 ? '1 new topic was' : `${new_topic_count} new topics were`;
  return `${topic_words} added since this path was made, so ${new_topic_count === 1 ? "it's" : "they're"} at the end. Reorder to fit them in.`;
}

// One step: its place, status, topic, why it comes here, and ways to learn it.
function PathStep({ skill_id, path_step, step_number, is_starting, on_start, on_open_lesson }) {
  const { label, icon: StatusIcon, text_classes, card_classes } = PATH_STATUS_DETAILS[path_step.status];
  const lesson_action = get_lesson_action(path_step);
  const topic_details = { skill_id, topic_id: path_step.topic_id };

  return (
    <li aria-current={path_step.status === 'next' ? 'step' : undefined} className={`flex flex-col gap-3 rounded-2xl border bg-surface p-4 sm:p-5 ${card_classes}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-small font-bold text-ink">
            {step_number}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-lead font-semibold text-ink">
              <span className="sr-only">Step {step_number}: </span>
              {path_step.topic}
            </h3>
            {path_step.parent_topic && <p className="text-caption text-ink-muted">Part of {path_step.parent_topic}</p>}
          </div>
        </div>
        <span className={`flex items-center gap-1.5 text-small font-semibold ${text_classes}`}>
          <StatusIcon aria-hidden="true" className="h-4 w-4" />
          {label}
          {path_step.is_new && <span className="font-normal text-ink-muted">(new)</span>}
        </span>
      </div>
      {(path_step.reason || path_step.summary) && <p className="text-body text-ink-muted">{path_step.reason || path_step.summary}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => (lesson_action.lesson_id ? on_open_lesson(lesson_action.lesson_id) : on_start(path_step))}
          disabled={is_starting}
          aria-label={`${lesson_action.label}: ${path_step.topic}`}
          className={get_button_classes(path_step.status === 'next' ? 'primary' : 'secondary', 'px-3 py-1.5 text-small')}
        >
          <BookOpenCheck aria-hidden="true" className="h-4 w-4" />
          {is_starting ? 'Writing your lesson (up to 20 seconds)…' : lesson_action.label}
        </button>
        <Link
          to={build_learn_path({ ...topic_details, tab: 'practice' })}
          aria-label={`Practise ${path_step.topic}`}
          className={get_button_classes('ghost', 'px-3 py-1.5 text-small')}
        >
          <Dumbbell aria-hidden="true" className="h-4 w-4" />
          Practise
        </Link>
        <Link
          to={build_quiz_path(topic_details)}
          aria-label={`Quiz me on ${path_step.topic}`}
          className={get_button_classes('ghost', 'px-3 py-1.5 text-small')}
        >
          <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
          Quiz me
        </Link>
      </div>
    </li>
  );
}

// The Learning path tab: the skill's topics in the order to learn them, with where the
// student is up to. Starting a step's lesson opens it (on_lesson_started(lesson));
// on_open_lesson(lesson_id) reopens one in progress.
function LearningPathPanel({ skill, on_lesson_started, on_open_lesson }) {
  const path_state = use_api_data(() => fetch_learning_path(skill.id), [skill.id]);
  const [is_building, set_is_building] = useState(false);
  const [starting_topic_id, set_starting_topic_id] = useState(null);
  const [action_error, set_action_error] = useState('');
  const path = path_state.data;

  async function make_path() {
    set_is_building(true);
    set_action_error('');
    try {
      path_state.set_data(await build_learning_path(skill.id));
    } catch (build_error) {
      set_action_error(build_error.message);
    } finally {
      set_is_building(false);
    }
  }

  async function start_step(path_step) {
    set_starting_topic_id(path_step.topic_id);
    set_action_error('');
    try {
      on_lesson_started(await start_guided_lesson(skill.id, { topic_id: path_step.topic_id, step_count: LESSON_STEP_COUNT.default }));
    } catch (start_error) {
      set_action_error(start_error.message);
    } finally {
      set_starting_topic_id(null);
    }
  }

  if (path_state.error) return <AlertMessage>{path_state.error}</AlertMessage>;
  if (!path) return <p className="text-small text-ink-muted">Loading your learning path…</p>;

  if (!path.has_path) {
    return (
      <section aria-labelledby="learning-path-heading" className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border bg-surface p-6">
        <Route aria-hidden="true" className="h-8 w-8 text-brand-700" />
        <h2 id="learning-path-heading" className="text-heading-2 font-bold text-ink">
          Your learning path
        </h2>
        <p className="max-w-prose text-body text-ink">
          The AI puts the topics of {skill.name} in the order to learn them, basics first. Then you work through them one
          guided lesson at a time, and the path shows what's next.
        </p>
        {path.topic_count === 0 && (
          <p className="text-small text-ink-muted">This skill has no topics yet, so they'll be found first from your resources.</p>
        )}
        {action_error && <AlertMessage>{action_error}</AlertMessage>}
        <button type="button" onClick={make_path} disabled={is_building} className={get_button_classes('primary')}>
          {is_building ? 'Planning your path…' : 'Build my learning path'}
        </button>
      </section>
    );
  }

  const done_count = count_done_steps(path.steps);
  const new_topics_note = describe_new_topics(path.new_topic_count);
  return (
    <section aria-labelledby="learning-path-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="learning-path-heading" className="text-heading-2 font-bold text-ink">
            Your learning path
          </h2>
          <p className="text-small text-ink-muted">
            {done_count} of {path.steps.length} topics done. A topic is done when you finish its lesson or your quizzes
            show it's strong.
          </p>
        </div>
        <button type="button" onClick={make_path} disabled={is_building} className={get_button_classes('secondary')}>
          {is_building ? 'Reordering…' : 'Reorder my path'}
        </button>
      </div>
      <progress
        value={done_count}
        max={Math.max(path.steps.length, 1)}
        aria-label={`Learning path progress: ${done_count} of ${path.steps.length} topics done`}
        className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-success [&::-webkit-progress-bar]:bg-canvas [&::-webkit-progress-value]:bg-success"
      />
      {new_topics_note && <p className="rounded-lg bg-brand-50 px-4 py-3 text-small text-ink">{new_topics_note}</p>}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {path.steps.length === 0 ? (
        <p className="text-body text-ink">There are no topics on the path. Add some on the skill map, then reorder.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {path.steps.map((path_step, step_index) => (
            <PathStep
              key={path_step.topic_id}
              skill_id={skill.id}
              path_step={path_step}
              step_number={step_index + 1}
              is_starting={starting_topic_id === path_step.topic_id}
              on_start={start_step}
              on_open_lesson={on_open_lesson}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

export default LearningPathPanel;
