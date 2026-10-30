import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { QUIZ_REMINDER_DISMISSED_KEY, ROUTE_PATHS } from '../config/constants.js';
import { use_auth } from '../context/AuthContext.jsx';
import { has_learning_profile } from '../services/learning_quiz_service.js';
import { read_device_value, save_device_value } from '../utils/device_storage.js';
import { get_button_classes } from './button_styles.js';

// A friendly nudge at the top of the dashboard for students who skipped the learning
// style quiz. Renders nothing once the quiz has been taken, or after "Not now" on this
// device (Settings still offers the quiz).
function LearningQuizReminder() {
  const { account } = use_auth();
  const [is_dismissed, set_is_dismissed] = useState(() => Boolean(read_device_value(QUIZ_REMINDER_DISMISSED_KEY)));
  if (has_learning_profile(account) || is_dismissed) return null;

  function dismiss() {
    save_device_value(QUIZ_REMINDER_DISMISSED_KEY, 'true');
    set_is_dismissed(true);
  }

  return (
    <aside
      aria-label="Learning style quiz reminder"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
        <p className="text-small text-ink">
          <span className="font-semibold">Make StudyApp yours.</span> Take the 2-minute learning style quiz so your
          schedule and quizzes fit how you learn.
        </p>
      </div>
      <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
        <button type="button" onClick={dismiss} className={get_button_classes('ghost', 'px-3 py-2 text-small')}>
          Not now
        </button>
        <Link to={ROUTE_PATHS.learning_quiz} className={get_button_classes('primary', 'px-3 py-2 text-small')}>
          Take the quiz
        </Link>
      </div>
    </aside>
  );
}

export default LearningQuizReminder;
