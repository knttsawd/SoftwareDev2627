import { Bot } from 'lucide-react';
import { AI_STUDENT_NAME } from '../../config/constants.js';
import { submit_lesson_answers } from '../../services/teach_service.js';
import QuizRunner from '../quiz/QuizRunner.jsx';

// The student's turn at the lesson's quiz. The AI student has already answered, but its
// answers stay hidden until the student finishes. on_graded({ teach_session, topic }) runs
// with the graded lesson.
function TeachQuiz({ teach_session, feedback_timing, on_graded }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-small text-ink">
        <Bot aria-hidden="true" className="h-6 w-6 shrink-0 text-accent-700" />
        <p>
          Your turn. {AI_STUDENT_NAME} has already answered this quiz on {teach_session.topic}. You'll see how you both did
          when you finish.
        </p>
      </div>
      <QuizRunner
        quiz={teach_session.quiz}
        feedback_timing={feedback_timing}
        on_graded={on_graded}
        submit_answers={(quiz_id, answers) => submit_lesson_answers(teach_session.id, answers)}
      />
    </div>
  );
}

export default TeachQuiz;
