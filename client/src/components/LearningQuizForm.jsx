import { useState } from 'react';
import AlertMessage from './AlertMessage.jsx';
import { get_button_classes } from './button_styles.js';
import QuizQuestionField from './QuizQuestionField.jsx';

// The learning style quiz as a form. Reused by sign-up step 2 now and by Settings in Phase 8.
// on_submit(answers) should save them and throw the API error on failure; its
// field_errors are shown under the matching questions.
function LearningQuizForm({ questions, initial_answers, submit_label, on_submit }) {
  const [answers, set_answers] = useState(initial_answers);
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_saving, set_is_saving] = useState(false);

  function update_answer(question_id, answer) {
    set_answers((current_answers) => ({ ...current_answers, [question_id]: answer }));
  }

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_is_saving(true);
    set_form_error('');
    set_field_errors({});
    try {
      await on_submit(answers);
    } catch (save_error) {
      set_field_errors(save_error.field_errors ?? {});
      set_form_error(save_error.message);
    } finally {
      set_is_saving(false);
    }
  }

  return (
    <form onSubmit={handle_submit} noValidate className="flex flex-col gap-5">
      {questions.map((question) => (
        <QuizQuestionField
          key={question.id}
          question={question}
          answer={answers[question.id]}
          error={field_errors[question.id]}
          on_change={(answer) => update_answer(question.id, answer)}
        />
      ))}
      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      <button type="submit" disabled={is_saving} className={get_button_classes('primary', 'self-start')}>
        {is_saving ? 'Saving…' : submit_label}
      </button>
    </form>
  );
}

export default LearningQuizForm;
