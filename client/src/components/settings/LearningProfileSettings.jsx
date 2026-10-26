import { useState } from 'react';
import { use_api_data } from '../../hooks/use_api_data.js';
import {
  build_initial_answers,
  fetch_learning_quiz,
  has_learning_profile,
  save_learning_profile,
} from '../../services/learning_quiz_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import LearningQuizForm from '../LearningQuizForm.jsx';

export const NOT_ANSWERED = 'Not answered';

// A saved answer in words: the chosen option's label, several labels for a multiple
// choice question, or the typed text.
export function describe_answer(question, answer) {
  if (question.type === 'text') return answer?.trim() ? answer : NOT_ANSWERED;
  const chosen_values = Array.isArray(answer) ? answer : [answer];
  const labels = question.options.filter((option) => chosen_values.includes(option.value)).map((option) => option.label);
  return labels.length > 0 ? labels.join(', ') : NOT_ANSWERED;
}

// The learning style and goals quiz in Settings: the current answers, and the quiz again
// (filled in with them) to change them. on_saved(account) receives the updated account.
function LearningProfileSettings({ account, on_saved }) {
  const questions_state = use_api_data(fetch_learning_quiz, [], { live: false });
  const [is_editing, set_is_editing] = useState(false);
  const [status_message, set_status_message] = useState('');
  const questions = questions_state.data ?? [];
  const has_answers = has_learning_profile(account);

  async function handle_save(answers) {
    on_saved(await save_learning_profile(answers));
    set_is_editing(false);
    set_status_message('Saved. Your focus timer now matches your new answers.');
  }

  if (questions_state.error) return <AlertMessage>{questions_state.error}</AlertMessage>;
  if (!questions_state.data) return <p className="text-small text-ink-muted">Loading the quiz…</p>;

  if (is_editing) {
    return (
      <div className="flex flex-col gap-4">
        <LearningQuizForm
          questions={questions}
          initial_answers={build_initial_answers(questions, account.learning_profile)}
          submit_label="Save my answers"
          on_submit={handle_save}
        />
        <button type="button" onClick={() => set_is_editing(false)} className={get_button_classes('ghost', 'self-start px-2')}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {status_message && <AlertMessage tone="success">{status_message}</AlertMessage>}
      {has_answers ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {questions.map((question) => (
            <div key={question.id} className="flex flex-col gap-0.5">
              <dt className="text-small text-ink-muted">{question.prompt}</dt>
              <dd className="text-body text-ink">{describe_answer(question, account.learning_profile[question.id])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-body text-ink">
          You haven't taken the quiz yet. Your answers shape your study plan, your notes and how quizzes give feedback.
        </p>
      )}
      <button type="button" onClick={() => set_is_editing(true)} className={get_button_classes('secondary', 'self-start')}>
        {has_answers ? 'Retake the quiz' : 'Take the quiz'}
      </button>
    </div>
  );
}

export default LearningProfileSettings;
