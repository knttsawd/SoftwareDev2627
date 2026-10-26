import { CircleCheck, CircleX, Eye, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { PRACTICE_ANSWER_MAX_LENGTH } from '../../config/constants.js';
import { check_practice_answer, show_practice_hint, show_practice_solution } from '../../services/learning_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import MarkdownContent from '../MarkdownContent.jsx';

// "Hints (1 of 3)".
export function describe_hint_count(practice_problem) {
  return `Hints (${practice_problem.hints.length} of ${practice_problem.hint_count})`;
}

// The worked example: the problem, each step of the solution, and the answer.
function WorkedExample({ worked_example }) {
  return (
    <section aria-labelledby="worked-example-heading" className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <h2 id="worked-example-heading" className="text-heading-3 font-semibold text-ink">
        Worked example
      </h2>
      <MarkdownContent markdown_text={worked_example.problem} />
      <ol className="ml-5 list-decimal space-y-1 text-body text-ink">
        {worked_example.steps.map((solution_step, step_index) => (
          <li key={step_index}>{solution_step}</li>
        ))}
      </ol>
      <p className="font-semibold text-ink">Answer: {worked_example.answer}</p>
    </section>
  );
}

// One earlier answer and the feedback on it, right or not in words as well as color.
function AttemptFeedback({ attempt }) {
  const FeedbackIcon = attempt.is_correct ? CircleCheck : CircleX;
  return (
    <li className={`flex flex-col gap-1 rounded-lg border p-3 text-small ${attempt.is_correct ? 'border-success bg-success-soft' : 'border-border bg-canvas'}`}>
      <p className="flex items-center gap-2 font-semibold text-ink">
        <FeedbackIcon aria-hidden="true" className={`h-4 w-4 ${attempt.is_correct ? 'text-success' : 'text-danger'}`} />
        {attempt.is_correct ? 'Right' : 'Not yet'}: “{attempt.answer}”
      </p>
      <p className="text-ink">{attempt.feedback}</p>
    </li>
  );
}

// One problem to solve: the answer box with AI checking, hints one at a time, and the
// full solution on request. on_changed(practice_set) receives each update.
function PracticeProblem({ practice_id, practice_problem, problem_index, on_changed }) {
  const [answer, set_answer] = useState('');
  const [busy_action, set_busy_action] = useState(null);
  const [action_error, set_action_error] = useState('');
  const answer_id = `practice-${practice_id}-answer-${problem_index}`;

  async function run(action_name, practice_action) {
    set_busy_action(action_name);
    set_action_error('');
    try {
      on_changed(await practice_action());
      return true;
    } catch (action_failure) {
      set_action_error(action_failure.message);
      return false;
    } finally {
      set_busy_action(null);
    }
  }

  async function handle_check(submit_event) {
    submit_event.preventDefault();
    const is_checked = await run('check', async () => (await check_practice_answer(practice_id, problem_index, answer)).practice_set);
    if (is_checked) set_answer('');
  }

  const has_more_hints = practice_problem.hints.length < practice_problem.hint_count;

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-heading-3 font-semibold text-ink">Problem {problem_index + 1}</h3>
        {practice_problem.is_solved && (
          <span className="flex items-center gap-1.5 text-small font-semibold text-success">
            <CircleCheck aria-hidden="true" className="h-4 w-4" />
            Solved
          </span>
        )}
      </div>
      <MarkdownContent markdown_text={practice_problem.problem} />

      {practice_problem.hints.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-small font-semibold text-ink">{describe_hint_count(practice_problem)}</p>
          <ol aria-live="polite" className="ml-5 list-decimal space-y-1 text-body text-ink">
            {practice_problem.hints.map((hint, hint_index) => (
              <li key={hint_index}>{hint}</li>
            ))}
          </ol>
        </div>
      )}

      {practice_problem.attempts.length > 0 && (
        <ul aria-label={`Your answers to problem ${problem_index + 1}`} aria-live="polite" className="flex flex-col gap-2">
          {practice_problem.attempts.map((attempt, attempt_index) => (
            <AttemptFeedback key={attempt_index} attempt={attempt} />
          ))}
        </ul>
      )}

      {!practice_problem.is_solved && (
        <form onSubmit={handle_check} noValidate className="flex flex-col gap-2">
          <label htmlFor={answer_id} className="text-small font-semibold text-ink">
            Your answer
          </label>
          <textarea
            id={answer_id}
            value={answer}
            maxLength={PRACTICE_ANSWER_MAX_LENGTH}
            rows={2}
            onChange={(change_event) => set_answer(change_event.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!answer.trim() || Boolean(busy_action)} className={get_button_classes('primary')}>
              {busy_action === 'check' ? 'Checking…' : 'Check my answer'}
            </button>
            {has_more_hints && (
              <button
                type="button"
                onClick={() => run('hint', () => show_practice_hint(practice_id, problem_index))}
                disabled={Boolean(busy_action)}
                className={get_button_classes('secondary')}
              >
                <Lightbulb aria-hidden="true" className="h-4 w-4" />
                {practice_problem.hints.length === 0 ? 'Show a hint' : 'Show another hint'}
              </button>
            )}
            {!practice_problem.is_solution_shown && (
              <button
                type="button"
                onClick={() => run('solution', () => show_practice_solution(practice_id, problem_index))}
                disabled={Boolean(busy_action)}
                className={get_button_classes('ghost')}
              >
                <Eye aria-hidden="true" className="h-4 w-4" />
                Show the solution
              </button>
            )}
          </div>
        </form>
      )}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}

      {practice_problem.is_solution_shown && (
        <div aria-live="polite" className="flex flex-col gap-2 rounded-lg bg-canvas p-4">
          <p className="font-semibold text-ink">Solution</p>
          <ol className="ml-5 list-decimal space-y-1 text-body text-ink">
            {practice_problem.solution_steps.map((solution_step, step_index) => (
              <li key={step_index}>{solution_step}</li>
            ))}
          </ol>
          <p className="font-semibold text-ink">Answer: {practice_problem.answer}</p>
        </div>
      )}
    </li>
  );
}

// A practice set: the worked example, then each problem. Nothing here is graded: it's
// for learning by doing. on_changed(practice_set) receives each update.
function PracticeView({ practice_set, on_changed }) {
  const problem_count = practice_set.problems.length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-small font-semibold text-brand-700">
          {practice_set.topic} · {practice_set.solved_count} of {problem_count} solved
        </p>
        <progress
          value={practice_set.solved_count}
          max={problem_count}
          aria-label={`Practice progress: ${practice_set.solved_count} of ${problem_count} problems solved`}
          className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
        />
      </div>
      <WorkedExample worked_example={practice_set.worked_example} />
      <section aria-labelledby="practice-problems-heading" className="flex flex-col gap-3">
        <h2 id="practice-problems-heading" className="text-heading-2 font-bold text-ink">
          Your turn
        </h2>
        <p className="text-small text-ink-muted">
          Have a go first. Hints give a little more help each time, and the solution is there when you need it.
        </p>
        <ol className="flex flex-col gap-4">
          {practice_set.problems.map((practice_problem, problem_index) => (
            <PracticeProblem
              key={problem_index}
              practice_id={practice_set.id}
              practice_problem={practice_problem}
              problem_index={problem_index}
              on_changed={on_changed}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

export default PracticeView;
