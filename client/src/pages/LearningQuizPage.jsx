import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import AlertMessage from '../components/AlertMessage.jsx';
import { get_button_classes } from '../components/button_styles.js';
import LearningQuizForm from '../components/LearningQuizForm.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PageTitle from '../components/PageTitle.jsx';
import StepIndicator from '../components/StepIndicator.jsx';
import { ROUTE_PATHS, SIGN_UP_STEP_COUNT } from '../config/constants.js';
import { use_auth } from '../context/AuthContext.jsx';
import {
  build_initial_answers,
  fetch_learning_quiz,
  save_learning_profile,
} from '../services/learning_quiz_service.js';

// Sign-up step 2: the learning style and goals quiz. Loads the questions from the server,
// saves the answers, then opens the dashboard. Students can skip it and take it later
// from the dashboard reminder.
function LearningQuizPage() {
  const { account, set_account } = use_auth();
  const navigate = useNavigate();
  const [questions, set_questions] = useState(null);
  const [load_error, set_load_error] = useState('');

  useEffect(() => {
    let is_current = true;
    fetch_learning_quiz()
      .then((loaded_questions) => {
        if (is_current) set_questions(loaded_questions);
      })
      .catch((fetch_error) => {
        if (is_current) set_load_error(fetch_error.message);
      });
    return () => {
      is_current = false;
    };
  }, []);

  async function handle_save(answers) {
    set_account(await save_learning_profile(answers));
    navigate(ROUTE_PATHS.dashboard);
  }

  function handle_skip() {
    navigate(ROUTE_PATHS.dashboard);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <PageTitle page_name="Learning style quiz" />
      <StepIndicator current_step={2} step_count={SIGN_UP_STEP_COUNT} step_name="How you learn" />
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 font-bold text-ink">How do you like to learn, {account.first_name}?</h1>
        <p className="text-body text-ink-muted">
          Your answers shape your study schedule and your quizzes. There are no wrong answers, and you can retake this
          anytime in Settings.
        </p>
        <button type="button" onClick={handle_skip} className={get_button_classes('ghost', 'self-start px-0')}>
          Skip for now
        </button>
      </div>

      {load_error && <AlertMessage>{load_error}</AlertMessage>}
      {!questions && !load_error && <LoadingScreen label="Loading the quiz" />}
      {questions && (
        <LearningQuizForm
          questions={questions}
          initial_answers={build_initial_answers(questions, account.learning_profile)}
          submit_label="Finish and go to my dashboard"
          on_submit={handle_save}
        />
      )}
    </div>
  );
}

export default LearningQuizPage;
