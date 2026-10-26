import { ChevronDown, CircleCheck, CircleX, ClipboardCheck, Dumbbell, GraduationCap, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AI_STUDENT_NAME } from '../../config/constants.js';
import { answer_lesson_check, go_to_next_step, reteach_lesson_step } from '../../services/learning_service.js';
import { get_choice_letter } from '../../utils/format.js';
import { build_learn_path, build_quiz_path, build_teach_path } from '../../utils/study_paths.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import MarkdownContent from '../MarkdownContent.jsx';
import ExplainAnotherWay from './ExplainAnotherWay.jsx';

// How a finished step went, from its checks: right first time, right after another
// explanation, or still tricky.
export function describe_step_outcome(step) {
  const answered_checks = step.checks.filter((check) => check.chosen_index !== null);
  if (answered_checks.length === 0) return 'Not answered yet';
  if (answered_checks[0].is_correct) return 'Right first time';
  return answered_checks.some((check) => check.is_correct) ? 'Got it after another explanation' : 'Worth another look';
}

// The words on the button that moves on from the current step, after a right or a wrong answer.
export function get_next_label(lesson, is_correct) {
  if (lesson.current_step === lesson.step_count - 1) return is_correct ? 'Finish the lesson' : 'Finish anyway';
  return is_correct ? 'Next step' : 'Move on';
}

// Whether an answered check was right, in words with an icon, then why.
function CheckFeedback({ check }) {
  const FeedbackIcon = check.is_correct ? CircleCheck : CircleX;
  return (
    <div
      role="status"
      className={`flex flex-col gap-1 rounded-lg border p-3 text-small ${check.is_correct ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        <FeedbackIcon aria-hidden="true" className="h-4 w-4" />
        {check.is_correct
          ? 'Correct!'
          : `Not quite. The answer is ${get_choice_letter(check.correct_index)}: ${check.choices[check.correct_index]}`}
      </p>
      {check.explanation && <p className="text-ink">{check.explanation}</p>}
    </div>
  );
}

// One check question, after its re-explanation if it has one. Unanswered, it offers the
// choices and a Check button (on_answer(choice_index)); answered, it shows the outcome.
function LessonCheck({ check, check_id, is_busy, on_answer }) {
  const [chosen_index, set_chosen_index] = useState(null);
  const is_answered = check.chosen_index !== null;

  return (
    <div className="flex flex-col gap-3">
      {check.reteach_markdown && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <RefreshCw aria-hidden="true" className="h-4 w-4 text-brand-700" />
            Another way to look at it
          </p>
          <MarkdownContent markdown_text={check.reteach_markdown} />
        </div>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-ink">Check: {check.question}</legend>
        {check.choices.map((choice, choice_index) => {
          const choice_id = `${check_id}-c${choice_index}`;
          const is_chosen = (is_answered ? check.chosen_index : chosen_index) === choice_index;
          return (
            <label
              key={choice_id}
              htmlFor={choice_id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-2.5 text-body ${is_chosen ? 'border-brand-600 bg-brand-50' : 'border-border bg-surface hover:bg-canvas'}`}
            >
              <input
                id={choice_id}
                type="radio"
                name={check_id}
                checked={is_chosen}
                disabled={is_answered}
                onChange={() => set_chosen_index(choice_index)}
                className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
              />
              <span>
                <span className="font-semibold">{get_choice_letter(choice_index)}.</span> {choice}
              </span>
            </label>
          );
        })}
      </fieldset>
      {is_answered ? (
        <CheckFeedback check={check} />
      ) : (
        <button
          type="button"
          onClick={() => on_answer(chosen_index)}
          disabled={chosen_index === null || is_busy}
          className={get_button_classes('primary', 'self-start')}
        >
          Check my answer
        </button>
      )}
    </div>
  );
}

// The step being learned: its idea, an example, "explain another way", and its checks.
// Focus moves to the step's heading when a new step opens, and to a new check when the
// step is explained again, so keyboard and screen reader users land on what's new.
function LessonStep({ lesson, step, is_busy, on_answer }) {
  const heading_ref = useRef(null);
  const latest_check_ref = useRef(null);
  const shown_step = useRef(lesson.current_step);
  const shown_check_count = useRef(step.checks.length);

  useEffect(() => {
    if (shown_step.current !== lesson.current_step) heading_ref.current?.focus();
    shown_step.current = lesson.current_step;
  }, [lesson.current_step]);

  useEffect(() => {
    if (step.checks.length > shown_check_count.current) latest_check_ref.current?.focus();
    shown_check_count.current = step.checks.length;
  }, [step.checks.length]);

  return (
    <article aria-labelledby="lesson-step-heading" className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 id="lesson-step-heading" ref={heading_ref} tabIndex={-1} className="text-heading-2 font-bold text-ink">
        {step.title}
      </h2>
      <MarkdownContent markdown_text={step.explanation_markdown} />
      {step.example_markdown && (
        <div className="flex flex-col gap-2 rounded-lg bg-canvas p-4">
          <p className="font-semibold text-ink">Example</p>
          <MarkdownContent markdown_text={step.example_markdown} />
        </div>
      )}
      <ExplainAnotherWay skill_id={lesson.skill_id} text={step.explanation_markdown} topic_id={lesson.topic_id} />
      {step.checks.map((check, check_index) => (
        <div
          key={`${lesson.current_step}-${check_index}`}
          ref={check_index === step.checks.length - 1 ? latest_check_ref : null}
          tabIndex={-1}
        >
          <LessonCheck
            check={check}
            check_id={`lesson-${lesson.id}-s${lesson.current_step}-k${check_index}`}
            is_busy={is_busy}
            on_answer={on_answer}
          />
        </div>
      ))}
    </article>
  );
}

// Earlier (or, once finished, all) steps, folded away for review.
function FinishedSteps({ steps }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, step_index) => (
        <li key={step.title + step_index}>
          <details className="group rounded-lg border border-border bg-surface">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2 font-semibold text-ink">
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                Step {step_index + 1}: {step.title}
              </span>
              <span className="text-caption text-ink-muted">{describe_step_outcome(step)}</span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
              <MarkdownContent markdown_text={step.explanation_markdown} />
              {step.example_markdown && <MarkdownContent markdown_text={step.example_markdown} />}
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}

// What to do after a lesson: practise, quiz or teach the same topic.
function LessonSummary({ lesson }) {
  const topic_details = { skill_id: lesson.skill_id, topic_id: lesson.topic_id };
  return (
    <section aria-labelledby="lesson-summary-heading" className="flex flex-col gap-4 rounded-2xl border border-success bg-success-soft p-5">
      <h2 id="lesson-summary-heading" className="flex items-center gap-2 text-heading-2 font-bold text-ink">
        <CircleCheck aria-hidden="true" className="h-6 w-6 text-success" />
        Lesson finished
      </h2>
      <p className="text-body text-ink">
        You got {lesson.first_try_correct} of {lesson.step_count} checks right first time. Try it yourself next, while it's fresh.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to={build_learn_path({ ...topic_details, tab: 'practice' })} className={get_button_classes('primary')}>
          <Dumbbell aria-hidden="true" className="h-4 w-4" />
          Practise this topic
        </Link>
        {lesson.topic_id && (
          <Link to={build_quiz_path(topic_details)} className={get_button_classes('secondary')}>
            <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
            Quiz me on it
          </Link>
        )}
        <Link to={build_teach_path(topic_details)} className={get_button_classes('secondary')}>
          <GraduationCap aria-hidden="true" className="h-4 w-4" />
          Teach it to {AI_STUDENT_NAME}
        </Link>
      </div>
    </section>
  );
}

// A guided lesson: the AI teaches a topic in short steps, each ending in a check question.
// A wrong answer can be explained another way (with a new question) before moving on.
// on_lesson_changed(lesson) receives the lesson after every answer or step.
function GuidedLessonView({ lesson, on_lesson_changed }) {
  const [is_busy, set_is_busy] = useState(false);
  const [action_error, set_action_error] = useState('');
  const step = lesson.steps[lesson.current_step];
  const latest_check = step.checks.at(-1);
  const is_answered = latest_check.chosen_index !== null;

  async function run(lesson_action) {
    set_is_busy(true);
    set_action_error('');
    try {
      on_lesson_changed(await lesson_action());
    } catch (action_failure) {
      set_action_error(action_failure.message);
    } finally {
      set_is_busy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-small font-semibold text-brand-700">
          {lesson.topic} · {lesson.is_complete ? 'Finished' : `Step ${lesson.current_step + 1} of ${lesson.step_count}`}
        </p>
        <progress
          value={lesson.is_complete ? lesson.step_count : lesson.current_step}
          max={lesson.step_count}
          aria-label={`Lesson progress: ${lesson.is_complete ? lesson.step_count : lesson.current_step} of ${lesson.step_count} steps done`}
          className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
        />
      </div>

      {lesson.is_complete ? (
        <>
          <LessonSummary lesson={lesson} />
          <FinishedSteps steps={lesson.steps} />
        </>
      ) : (
        <>
          {lesson.current_step > 0 && <FinishedSteps steps={lesson.steps.slice(0, lesson.current_step)} />}
          <LessonStep
            lesson={lesson}
            step={step}
            is_busy={is_busy}
            on_answer={(choice_index) => run(() => answer_lesson_check(lesson.id, choice_index))}
          />
          {action_error && <AlertMessage>{action_error}</AlertMessage>}
          {is_answered && (
            <div className="flex flex-wrap gap-3">
              {lesson.can_reteach && (
                <button type="button" onClick={() => run(() => reteach_lesson_step(lesson.id))} disabled={is_busy} className={get_button_classes('primary')}>
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  {is_busy ? 'Explaining…' : 'Explain it another way'}
                </button>
              )}
              <button
                type="button"
                onClick={() => run(() => go_to_next_step(lesson.id))}
                disabled={is_busy}
                className={get_button_classes(latest_check.is_correct || !lesson.can_reteach ? 'primary' : 'secondary')}
              >
                {get_next_label(lesson, latest_check.is_correct)}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default GuidedLessonView;
