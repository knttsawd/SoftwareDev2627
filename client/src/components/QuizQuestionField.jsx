import { toggle_choice } from '../services/learning_quiz_service.js';

const OPTION_CHOSEN_CLASSES = 'border-brand-600 bg-brand-50';
const OPTION_IDLE_CLASSES = 'border-border bg-surface hover:bg-canvas';

// Shows one learning quiz question: radio buttons for "single", checkboxes for
// "multiple", a text box for "text". on_change receives the whole new answer
// (an option value, a list of values, or the text).
function QuizQuestionField({ question, answer, error, on_change }) {
  const error_id = `${question.id}-error`;
  const error_message = error && (
    <p id={error_id} className="mt-2 text-caption font-semibold text-danger">
      {error}
    </p>
  );

  if (question.type === 'text') {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <label htmlFor={question.id} className="font-display text-lead font-semibold text-ink">
          {question.prompt}
        </label>
        <textarea
          id={question.id}
          name={question.id}
          rows={3}
          value={answer}
          maxLength={question.max_length}
          placeholder={question.placeholder}
          onChange={(change_event) => on_change(change_event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? error_id : undefined}
          className="rounded-lg border border-border px-3 py-2.5 text-body"
        />
        {error_message}
      </div>
    );
  }

  const is_single = question.type === 'single';
  return (
    <fieldset
      aria-describedby={error ? error_id : undefined}
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <legend className="px-1 font-display text-lead font-semibold text-ink">{question.prompt}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {question.options.map((option) => {
          const option_id = `${question.id}-${option.value}`;
          const is_chosen = is_single ? answer === option.value : answer.includes(option.value);
          return (
            <label
              key={option.value}
              htmlFor={option_id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-body ${is_chosen ? OPTION_CHOSEN_CLASSES : OPTION_IDLE_CLASSES}`}
            >
              <input
                id={option_id}
                type={is_single ? 'radio' : 'checkbox'}
                name={question.id}
                value={option.value}
                checked={is_chosen}
                onChange={() => on_change(is_single ? option.value : toggle_choice(answer, option.value))}
                className="h-4 w-4 shrink-0 accent-brand-600"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      {error_message}
    </fieldset>
  );
}

export default QuizQuestionField;
