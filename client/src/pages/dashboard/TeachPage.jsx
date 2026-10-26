import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import AlertMessage from '../../components/AlertMessage.jsx';
import { get_button_classes } from '../../components/button_styles.js';
import PageTitle from '../../components/PageTitle.jsx';
import TeachLesson from '../../components/teach/TeachLesson.jsx';
import TeachQuiz from '../../components/teach/TeachQuiz.jsx';
import TeachResults from '../../components/teach/TeachResults.jsx';
import TeachSetup from '../../components/teach/TeachSetup.jsx';
import { AI_STUDENT_NAME } from '../../config/constants.js';
import { get_feedback_timing } from '../../config/mastery.js';
import { use_auth } from '../../context/AuthContext.jsx';
import { use_api_data } from '../../hooks/use_api_data.js';
import { fetch_teach_session, start_teach_session } from '../../services/teach_service.js';

const SESSION_PARAM = 'session';

// The request body for teaching the same topic again: the map topic if the lesson had one.
export function build_repeat_lesson_details(teach_session) {
  return teach_session.topic_id ? { topic_id: teach_session.topic_id } : { topic: teach_session.topic };
}

// The Teach the AI student page. The address chooses what to show:
//   ?session=<id>               that lesson, at whatever stage it's at (so a reload resumes it)
//   ?skill=<id>&topic=<id>      the setup form with a topic chosen (from the skill map)
//   nothing                     the setup form and past lessons
function TeachPage() {
  const { account } = use_auth();
  const [search_params, set_search_params] = useSearchParams();
  const session_id = search_params.get(SESSION_PARAM);
  const session_state = use_api_data(
    () => (session_id ? fetch_teach_session(session_id) : Promise.resolve(null)),
    [session_id],
    { live: false },
  );
  const [updated_topic, set_updated_topic] = useState(null);
  const [action_error, set_action_error] = useState('');
  const teach_session = session_id ? session_state.data : null;

  function open_lesson(lesson_id) {
    set_updated_topic(null);
    set_action_error('');
    set_search_params({ [SESSION_PARAM]: lesson_id });
  }

  // A lesson the page already has (just started or updated), shown without loading it again.
  function show_lesson(new_session) {
    session_state.set_data(new_session);
    if (new_session.id !== session_id) open_lesson(new_session.id);
  }

  function handle_graded({ teach_session: graded_session, topic }) {
    session_state.set_data(graded_session);
    set_updated_topic(topic);
  }

  async function teach_again() {
    set_action_error('');
    try {
      show_lesson(await start_teach_session(teach_session.skill_id, build_repeat_lesson_details(teach_session)));
    } catch (start_error) {
      set_action_error(start_error.message);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageTitle page_name="Teach the AI student" />
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 font-bold text-ink">Teach the AI student</h1>
        <p className="text-body text-ink-muted">
          Explaining something is one of the best ways to learn it. Teach a topic to {AI_STUDENT_NAME}, an AI student
          that knows nothing except what you tell it, then see how you both do on the same quiz.
        </p>
      </div>

      {session_id && (
        <button type="button" onClick={() => set_search_params({})} className={get_button_classes('ghost', 'self-start px-2')}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          All lessons
        </button>
      )}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {session_id && session_state.error && <AlertMessage>{session_state.error}</AlertMessage>}
      {session_id && !teach_session && !session_state.error && (
        <p className="text-small text-ink-muted">Loading your lesson…</p>
      )}

      {!session_id && (
        <TeachSetup
          initial_skill_id={search_params.get('skill')}
          initial_topic_id={search_params.get('topic')}
          on_started={show_lesson}
          on_open_lesson={open_lesson}
        />
      )}
      {teach_session?.status === 'teaching' && <TeachLesson teach_session={teach_session} on_session_changed={show_lesson} />}
      {teach_session?.status === 'quiz' && (
        <TeachQuiz teach_session={teach_session} feedback_timing={get_feedback_timing(account)} on_graded={handle_graded} />
      )}
      {teach_session?.status === 'done' && (
        <TeachResults
          teach_session={teach_session}
          topic={updated_topic}
          on_teach_again={teach_again}
          on_back={() => set_search_params({})}
        />
      )}
    </div>
  );
}

export default TeachPage;
