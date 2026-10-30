import { Bot, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { AI_STUDENT_NAME, TEACH_MESSAGE_MAX_LENGTH, TEACH_QUIZ_QUESTION_COUNT } from '../../config/constants.js';
import { send_teaching_message, start_lesson_quiz } from '../../services/teach_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import ChatComposer from '../chat/ChatComposer.jsx';
import ChatThread from '../chat/ChatThread.jsx';

// The lesson's messages in the chat thread's shape: the student is "user", the AI student
// "assistant". Messages have no ids, so their position is used.
export function to_chat_messages(lesson_messages) {
  return lesson_messages.map((lesson_message, message_index) => ({
    id: `lesson-${message_index}`,
    role: lesson_message.role === 'teacher' ? 'user' : 'assistant',
    content: lesson_message.content,
  }));
}

// The teaching part of a lesson: explain the topic (typed or spoken) and answer the AI
// student's questions, then end the lesson to quiz both of you. Every change comes back
// as the updated session through on_session_changed(teach_session).
function TeachLesson({ teach_session, on_session_changed }) {
  const [draft, set_draft] = useState('');
  const [pending_explanation, set_pending_explanation] = useState(null);
  const [question_count, set_question_count] = useState(TEACH_QUIZ_QUESTION_COUNT.default);
  const [is_starting_quiz, set_is_starting_quiz] = useState(false);
  const [action_error, set_action_error] = useState('');
  const { teacher_message_count, max_teacher_messages } = teach_session;
  const is_lesson_full = teacher_message_count >= max_teacher_messages;

  // Shows the explanation at once; if the AI fails, it goes back into the box.
  async function send_explanation() {
    const explanation = draft.trim();
    if (!explanation) return;
    set_pending_explanation(explanation);
    set_draft('');
    set_action_error('');
    try {
      on_session_changed(await send_teaching_message(teach_session.id, explanation));
    } catch (send_error) {
      set_draft(explanation);
      set_action_error(send_error.message);
    } finally {
      set_pending_explanation(null);
    }
  }

  async function finish_lesson() {
    set_is_starting_quiz(true);
    set_action_error('');
    try {
      on_session_changed(await start_lesson_quiz(teach_session.id, question_count));
    } catch (quiz_error) {
      set_action_error(quiz_error.message);
      set_is_starting_quiz(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white">
          <Bot aria-hidden="true" className="h-7 w-7" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-heading-3 font-semibold text-ink">Teaching {teach_session.topic}</h2>
          <p className="text-small text-ink-muted">
            {AI_STUDENT_NAME} only knows what you teach. Explain in your own words, give examples, and answer{' '}
            {AI_STUDENT_NAME}'s questions.
          </p>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-48">
          <p className="text-caption font-semibold text-ink-muted">
            {teacher_message_count} of {max_teacher_messages} explanations
          </p>
          <progress
            value={teacher_message_count}
            max={max_teacher_messages}
            aria-label={`Lesson length: ${teacher_message_count} of ${max_teacher_messages} explanations`}
            className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-accent-600 [&::-webkit-progress-bar]:bg-accent-50 [&::-webkit-progress-value]:bg-accent-600"
          />
        </div>
      </div>

      <ChatThread
        messages={to_chat_messages(teach_session.lesson_messages)}
        pending_question={pending_explanation}
        assistant_label={AI_STUDENT_NAME}
      />
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {is_lesson_full ? (
        <p className="text-small text-ink">That's a full lesson. Start the quiz to see what {AI_STUDENT_NAME} learned.</p>
      ) : (
        <ChatComposer
          draft={draft}
          set_draft={set_draft}
          is_sending={Boolean(pending_explanation)}
          on_send={send_explanation}
          label="Your explanation"
          max_length={TEACH_MESSAGE_MAX_LENGTH}
          send_label={`Teach ${AI_STUDENT_NAME}`}
        />
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-canvas p-5">
        <h3 className="text-lead font-semibold text-ink">Done teaching?</h3>
        <p className="text-small text-ink-muted">
          You and {AI_STUDENT_NAME} take the same quiz. {AI_STUDENT_NAME} answers only from your lesson, so its score shows
          how well you taught. Your grade combines both scores.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="teach-question-count" className="text-small font-semibold text-ink">
              Questions
            </label>
            <input
              id="teach-question-count"
              type="number"
              min={TEACH_QUIZ_QUESTION_COUNT.min}
              max={TEACH_QUIZ_QUESTION_COUNT.max}
              value={question_count}
              onChange={(change_event) => set_question_count(Number(change_event.target.value))}
              className="w-24 rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
            />
          </div>
          <button
            type="button"
            onClick={finish_lesson}
            disabled={is_starting_quiz || teacher_message_count === 0 || Boolean(pending_explanation)}
            className={get_button_classes('primary')}
          >
            <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
            {is_starting_quiz ? `${AI_STUDENT_NAME} is taking the quiz…` : 'Finish and quiz us both'}
          </button>
        </div>
        {teacher_message_count === 0 && (
          <p className="text-caption text-ink-muted">Teach {AI_STUDENT_NAME} something first.</p>
        )}
      </div>
    </div>
  );
}

export default TeachLesson;
