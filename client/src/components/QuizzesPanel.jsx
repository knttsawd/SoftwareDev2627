import { ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ROUTE_PATHS } from '../config/constants.js';
import { QUIZ_QUESTION_COUNT } from '../config/resource_types.js';
import { use_confirm } from '../context/ConfirmContext.jsx';
import { use_api_data } from '../hooks/use_api_data.js';
import { delete_quiz, fetch_quiz, fetch_quizzes, generate_quiz } from '../services/study_material_service.js';
import { format_date, get_choice_letter } from '../utils/format.js';
import AlertMessage from './AlertMessage.jsx';
import { get_button_classes } from './button_styles.js';
import TopicGenerator from './TopicGenerator.jsx';

// A quiz's questions and lettered choices, as a preview. Answers stay hidden until the
// quiz is taken on the Quiz page.
export function QuizQuestionList({ questions }) {
  return (
    <ol className="ml-5 flex list-decimal flex-col gap-3">
      {questions.map((quiz_question, question_index) => (
        <li key={question_index} className="text-body text-ink">
          <p className="font-semibold">{quiz_question.question}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-small text-ink-muted">
            {quiz_question.choices.map((choice, choice_index) => (
              <li key={choice_index}>
                {get_choice_letter(choice_index)}. {choice}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// One saved quiz as an expandable block. Its questions load the first time it is opened;
// a quiz generated just now already has them.
function QuizItem({ quiz_summary, preloaded_questions, on_delete }) {
  const [questions, set_questions] = useState(preloaded_questions ?? null);
  const [load_error, set_load_error] = useState('');

  async function handle_toggle(toggle_event) {
    if (!toggle_event.currentTarget.open || questions) return;
    try {
      set_questions((await fetch_quiz(quiz_summary.id)).questions);
    } catch (fetch_error) {
      set_load_error(fetch_error.message);
    }
  }

  return (
    <li>
      <details open={Boolean(preloaded_questions)} onToggle={handle_toggle} className="group rounded-lg border border-border bg-surface">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
            {quiz_summary.topic}
          </span>
          <span className="text-caption text-ink-muted">
            {quiz_summary.question_count} questions · {format_date(quiz_summary.created_at)}
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          {load_error && <AlertMessage>{load_error}</AlertMessage>}
          {questions ? <QuizQuestionList questions={questions} /> : !load_error && <p className="text-small text-ink-muted">Loading…</p>}
          <Link to={`${ROUTE_PATHS.dashboard}/quiz?quiz=${quiz_summary.id}`} className={get_button_classes('primary', 'self-start')}>
            Take this quiz
          </Link>
          <button type="button" onClick={() => on_delete(quiz_summary)} className={get_button_classes('ghost', 'self-start px-2')}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Delete this quiz
          </button>
        </div>
      </details>
    </li>
  );
}

// AI practice quizzes for a skill: generate a quiz on a topic, preview or delete quizzes.
function QuizzesPanel({ skill }) {
  const quizzes_state = use_api_data(() => fetch_quizzes(skill.id), [skill.id]);
  const [question_count, set_question_count] = useState(QUIZ_QUESTION_COUNT.default);
  const [new_quiz_questions, set_new_quiz_questions] = useState({});
  const [action_error, set_action_error] = useState('');

  async function handle_generate(topic) {
    const quiz = await generate_quiz(skill.id, { topic, question_count });
    const quiz_summary = { ...quiz, question_count: quiz.questions.length };
    quizzes_state.set_data((current_quizzes) => [quiz_summary, ...(current_quizzes ?? [])]);
    set_new_quiz_questions({ [quiz.id]: quiz.questions });
  }

  const confirm = use_confirm();

  async function handle_delete(quiz_summary) {
    const message = `The quiz on "${quiz_summary.topic}" is deleted.`;
    if (!(await confirm({ title: 'Delete this quiz?', message, confirm_label: 'Delete' }))) return;
    set_action_error('');
    try {
      await delete_quiz(quiz_summary.id);
      quizzes_state.set_data((current_quizzes) => current_quizzes.filter((item) => item.id !== quiz_summary.id));
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  const question_count_field = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="quiz-question-count" className="text-small font-semibold text-ink">
        Questions
      </label>
      <input
        id="quiz-question-count"
        type="number"
        min={QUIZ_QUESTION_COUNT.min}
        max={QUIZ_QUESTION_COUNT.max}
        value={question_count}
        onChange={(change_event) => set_question_count(Number(change_event.target.value))}
        className="w-24 rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
      />
    </div>
  );

  return (
    <section aria-labelledby="quizzes-heading" className="flex flex-col gap-4">
      <h2 id="quizzes-heading" className="text-heading-2 font-bold text-ink">
        Quizzes
      </h2>
      <TopicGenerator
        field_id="quiz-topic"
        button_label="Make a quiz"
        busy_label="Writing questions…"
        has_resources={skill.resource_count > 0}
        on_generate={handle_generate}
        extra_fields={question_count_field}
      />
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {quizzes_state.error && <AlertMessage>{quizzes_state.error}</AlertMessage>}
      {quizzes_state.data?.length > 0 && (
        <ul className="flex flex-col gap-2">
          {quizzes_state.data.map((quiz_summary) => (
            <QuizItem
              key={quiz_summary.id}
              quiz_summary={quiz_summary}
              preloaded_questions={new_quiz_questions[quiz_summary.id]}
              on_delete={handle_delete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default QuizzesPanel;
