import { CircleCheck, CircleX } from 'lucide-react';
import { useState } from 'react';
import { QUIZ_FEEDBACK_TIMING } from '../../config/mastery.js';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { check_answer, submit_quiz_answers } from '../../services/study_material_service.js';
import { get_choice_letter } from '../../utils/format.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';

const CHOICE_CHOSEN_CLASSES = 'border-brand-600 bg-brand-50';
const CHOICE_IDLE_CLASSES = 'border-border bg-surface hover:bg-canvas';

// How many questions have no answer yet.
export function count_unanswered(answers) {
  return answers.filter((answer) => answer === null).length;
}

// The feedback shown under a checked question: an icon and a word, then the right answer
// and why, so the result never depends on color alone.
function AnswerFeedback({ feedback, choices }) {
  const FeedbackIcon = feedback.is_correct ? CircleCheck : CircleX;
  return (
    <div
      role="status"
      className={`flex flex-col gap-1 rounded-lg border p-3 text-small ${feedback.is_correct ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        <FeedbackIcon aria-hidden="true" className="h-4 w-4" />
        {feedback.is_correct ? 'Correct!' : `Not quite. The answer is ${get_choice_letter(feedback.correct_index)}: ${choices[feedback.correct_index]}`}
      </p>
      {feedback.explanation && <p className="text-ink">{feedback.explanation}</p>}
    </div>
  );
}

// Takes a quiz one question at a time. With feedback_timing "after_each" each answer is
// checked (and locked) before moving on; with "at_end" the student can go back and change
// answers until they finish. Finishing sends every answer for grading with
// submit_answers(quiz_id, answers) and calls on_graded with what it returns: by default
// the server's { result, question_results, topic }. A lesson's quiz passes its own.
function QuizRunner({ quiz, feedback_timing, on_graded, submit_answers = submit_quiz_answers }) {
  const question_count = quiz.questions.length;
  const [question_index, set_question_index] = useState(0);
  const [answers, set_answers] = useState(() => Array(question_count).fill(null));
  const [feedback_by_question, set_feedback_by_question] = useState({});
  const [action_error, set_action_error] = useState('');
  const [is_busy, set_is_busy] = useState(false);

  const quiz_question = quiz.questions[question_index];
  const feedback = feedback_by_question[question_index];
  const checks_each_answer = feedback_timing === QUIZ_FEEDBACK_TIMING.after_each;
  const is_last_question = question_index === question_count - 1;

  function choose_answer(choice_index) {
    if (feedback) return;
    set_answers((current_answers) => current_answers.map((answer, index) => (index === question_index ? choice_index : answer)));
  }

  async function handle_check() {
    set_is_busy(true);
    set_action_error('');
    try {
      const answer_feedback = await check_answer(quiz.id, question_index, answers[question_index]);
      set_feedback_by_question((current_feedback) => ({ ...current_feedback, [question_index]: answer_feedback }));
    } catch (check_error) {
      set_action_error(check_error.message);
    } finally {
      set_is_busy(false);
    }
  }

  const confirm = use_confirm();

  async function handle_finish() {
    const unanswered_count = count_unanswered(answers);
    if (unanswered_count > 0) {
      const is_finishing = await confirm({
        title: 'Finish the quiz?',
        message: `You skipped ${unanswered_count} question(s). Skipped questions count as wrong.`,
        confirm_label: 'Finish anyway',
        cancel_label: 'Keep going',
        tone: 'primary',
      });
      if (!is_finishing) return;
    }
    set_is_busy(true);
    set_action_error('');
    try {
      on_graded(await submit_answers(quiz.id, answers));
    } catch (submit_error) {
      set_action_error(submit_error.message);
      set_is_busy(false);
    }
  }

  const needs_check = checks_each_answer && !feedback && answers[question_index] !== null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-small font-semibold text-brand-700">
          Question {question_index + 1} of {question_count}
        </p>
        <progress
          value={question_index + 1}
          max={question_count}
          aria-label={`Quiz progress: question ${question_index + 1} of ${question_count}`}
          className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-display text-heading-3 font-semibold text-ink">{quiz_question.question}</legend>
        {quiz_question.choices.map((choice, choice_index) => {
          const choice_id = `quiz-${quiz.id}-q${question_index}-c${choice_index}`;
          const is_chosen = answers[question_index] === choice_index;
          return (
            <label
              key={choice_id}
              htmlFor={choice_id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-body ${is_chosen ? CHOICE_CHOSEN_CLASSES : CHOICE_IDLE_CLASSES}`}
            >
              <input
                id={choice_id}
                type="radio"
                name={`quiz-question-${question_index}`}
                checked={is_chosen}
                disabled={Boolean(feedback)}
                onChange={() => choose_answer(choice_index)}
                className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
              />
              <span>
                <span className="font-semibold">{get_choice_letter(choice_index)}.</span> {choice}
              </span>
            </label>
          );
        })}
      </fieldset>

      {feedback && <AnswerFeedback feedback={feedback} choices={quiz_question.choices} />}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}

      <div className="flex flex-wrap gap-3">
        {!checks_each_answer && question_index > 0 && (
          <button type="button" onClick={() => set_question_index(question_index - 1)} className={get_button_classes('secondary')}>
            Back
          </button>
        )}
        {needs_check && (
          <button type="button" onClick={handle_check} disabled={is_busy} className={get_button_classes('primary')}>
            Check answer
          </button>
        )}
        {!needs_check && !is_last_question && (
          <button type="button" onClick={() => set_question_index(question_index + 1)} className={get_button_classes('primary')}>
            {answers[question_index] === null ? 'Skip' : 'Next question'}
          </button>
        )}
        {!needs_check && is_last_question && (
          <button type="button" onClick={handle_finish} disabled={is_busy} className={get_button_classes('primary')}>
            {is_busy ? 'Grading…' : 'Finish quiz'}
          </button>
        )}
      </div>
    </div>
  );
}

export default QuizRunner;
