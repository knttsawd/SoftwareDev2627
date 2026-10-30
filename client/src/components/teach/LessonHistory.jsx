import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AI_STUDENT_NAME } from '../../config/constants.js';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { use_api_data } from '../../hooks/use_api_data.js';
import { delete_teach_session, fetch_teach_sessions } from '../../services/teach_service.js';
import { format_date } from '../../utils/format.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';

// How far a lesson got, in words, with its grade once there is one.
export function describe_lesson_status(lesson) {
  if (lesson.status === 'done') {
    return `Teaching grade ${lesson.combined_score}% (you ${lesson.student_score}%, ${AI_STUDENT_NAME} ${lesson.ai_student_score}%)`;
  }
  if (lesson.status === 'quiz') return 'Quiz waiting for your answers';
  return 'Still teaching';
}

// A skill's past lessons, newest first, each with a button to continue or review it
// (on_open(session_id)) and one to delete it.
function LessonHistory({ skill_id, on_open }) {
  const lessons_state = use_api_data(() => fetch_teach_sessions(skill_id), [skill_id]);
  const [action_error, set_action_error] = useState('');
  const lessons = lessons_state.data ?? [];

  const confirm = use_confirm();

  async function handle_delete(lesson) {
    const message = `Your lesson with Pip on "${lesson.topic}" is deleted.`;
    if (!(await confirm({ title: 'Delete this lesson?', message, confirm_label: 'Delete' }))) return;
    set_action_error('');
    try {
      await delete_teach_session(lesson.id);
      lessons_state.set_data((current_lessons) => current_lessons.filter((item) => item.id !== lesson.id));
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  if (lessons_state.is_loading && !lessons_state.data) return <p className="text-small text-ink-muted">Loading your lessons…</p>;
  if (lessons_state.error) return <AlertMessage>{lessons_state.error}</AlertMessage>;
  if (lessons.length === 0) return <p className="text-small text-ink-muted">No lessons in this skill yet.</p>;

  return (
    <div className="flex flex-col gap-2">
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      <ul className="flex flex-col gap-2">
        {lessons.map((lesson) => (
          <li key={lesson.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-ink">{lesson.topic}</span>
              <span className="text-caption text-ink-muted">
                {describe_lesson_status(lesson)} · {format_date(lesson.created_at)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => on_open(lesson.id)}
              aria-label={`${lesson.status === 'done' ? 'Review' : 'Continue'} the lesson on ${lesson.topic}`}
              className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}
            >
              {lesson.status === 'done' ? 'Review' : 'Continue'}
            </button>
            <button type="button" onClick={() => handle_delete(lesson)} className={get_button_classes('ghost', 'px-2')}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">Delete the lesson on {lesson.topic}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default LessonHistory;
