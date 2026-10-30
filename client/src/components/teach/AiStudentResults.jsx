import { Bot } from 'lucide-react';
import { Link } from 'react-router';
import { AI_STUDENT_NAME } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { fetch_teach_sessions } from '../../services/teach_service.js';
import { format_date } from '../../utils/format.js';
import { build_teach_path } from '../../utils/study_paths.js';
import { get_button_classes } from '../button_styles.js';

// One score as a labelled bar, e.g. "Pip: 40%".
function ScoreBar({ label, topic, score }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex justify-between text-caption text-ink">
        <span>{label}</span>
        <span className="font-semibold">{score}%</span>
      </span>
      <progress
        value={score}
        max={100}
        aria-label={`${topic}, ${label}: ${score}%`}
        className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-accent-600 [&::-webkit-progress-bar]:bg-accent-50 [&::-webkit-progress-value]:bg-accent-600"
      />
    </div>
  );
}

// The Quiz page's "AI student's quiz" section: recent lessons from every skill, with the
// AI student's score, the student's score and the teaching grade, and a link to review
// each one (or carry on with an unfinished one).
function AiStudentResults() {
  const lessons_state = use_api_data(() => fetch_teach_sessions(), []);
  const lessons = lessons_state.data ?? [];

  if (lessons_state.error) return <p className="text-small text-danger">{lessons_state.error}</p>;
  if (lessons.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-surface p-4">
        <Bot aria-hidden="true" className="h-6 w-6 shrink-0 text-accent-700" />
        <p className="flex-1 text-small text-ink">
          {lessons_state.is_loading
            ? 'Loading lessons…'
            : `Teach a topic to ${AI_STUDENT_NAME}, then ${AI_STUDENT_NAME}'s quiz and your teaching grade appear here.`}
        </p>
        {!lessons_state.is_loading && (
          <Link to={build_teach_path({})} className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}>
            Start a lesson
          </Link>
        )}
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {lessons.map((lesson) => (
        <li key={lesson.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-col">
            <span className="font-semibold text-ink">{lesson.topic}</span>
            <span className="text-caption text-ink-muted">
              {lesson.skill_name} · {format_date(lesson.created_at)}
            </span>
          </div>
          {lesson.status === 'done' ? (
            <div className="flex flex-col gap-2">
              <ScoreBar label={AI_STUDENT_NAME} topic={lesson.topic} score={lesson.ai_student_score} />
              <ScoreBar label="You" topic={lesson.topic} score={lesson.student_score} />
              <ScoreBar label="Teaching grade" topic={lesson.topic} score={lesson.combined_score} />
            </div>
          ) : (
            <p className="text-small text-ink-muted">{lesson.status === 'quiz' ? 'Your answers are still needed.' : 'Still teaching.'}</p>
          )}
          <Link
            to={build_teach_path({ session_id: lesson.id })}
            aria-label={`${lesson.status === 'done' ? 'Review' : 'Continue'} the lesson on ${lesson.topic}`}
            className={get_button_classes('secondary', 'self-start px-3 py-1.5 text-small')}
          >
            {lesson.status === 'done' ? 'Review' : 'Continue'}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default AiStudentResults;
