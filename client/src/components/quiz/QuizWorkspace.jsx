import { useEffect, useState } from 'react';
import { fetch_quiz, generate_quiz } from '../../services/study_material_service.js';
import AlertMessage from '../AlertMessage.jsx';
import QuizResults from './QuizResults.jsx';
import QuizRunner from './QuizRunner.jsx';
import QuizSetup from './QuizSetup.jsx';

export const QUIZ_STAGE = { setup: 'setup', running: 'running', results: 'results' };

// The request for a fresh quiz covering the same thing as quiz: the whole skill, one
// resource, a map topic or a typed topic.
export function build_retake_details(quiz) {
  const question_count = quiz.questions.length;
  if (quiz.scope === 'skill') return { scope: 'skill', question_count };
  if (quiz.scope === 'resource' && quiz.resource_id) return { scope: 'resource', resource_id: quiz.resource_id, question_count };
  if (quiz.topic_id) return { scope: 'topic', topic_id: quiz.topic_id, question_count };
  return { scope: 'topic', topic: quiz.topic, question_count };
}

// The whole quiz flow: choose a topic, answer the questions, see the graded results.
// Used by the Quiz page and inside work blocks.
//   initial_quiz_id     start straight into an existing quiz (e.g. "Take this quiz")
//   initial_skill_id, initial_topic_id, initial_resource_id   preselect the setup form
//   feedback_timing     "after_each" or "at_end" (from the learning style quiz)
//   on_finished(graded, quiz) optional, after a quiz is graded
function QuizWorkspace({
  initial_quiz_id,
  initial_skill_id,
  initial_topic_id,
  initial_resource_id,
  feedback_timing,
  on_finished,
}) {
  const [stage, set_stage] = useState(QUIZ_STAGE.setup);
  const [quiz, set_quiz] = useState(null);
  const [graded, set_graded] = useState(null);
  const [load_error, set_load_error] = useState('');
  const [is_retaking, set_is_retaking] = useState(false);

  useEffect(() => {
    if (!initial_quiz_id) return undefined;
    let is_current = true;
    fetch_quiz(initial_quiz_id)
      .then((loaded_quiz) => {
        if (!is_current) return;
        set_quiz(loaded_quiz);
        set_stage(QUIZ_STAGE.running);
      })
      .catch((fetch_error) => {
        if (is_current) set_load_error(fetch_error.message);
      });
    return () => {
      is_current = false;
    };
  }, [initial_quiz_id]);

  function start_quiz(new_quiz) {
    set_quiz(new_quiz);
    set_graded(null);
    set_stage(QUIZ_STAGE.running);
  }

  function show_results(graded_quiz) {
    set_graded(graded_quiz);
    set_stage(QUIZ_STAGE.results);
    on_finished?.(graded_quiz, quiz);
  }

  // A fresh quiz on the same thing.
  async function retake() {
    set_is_retaking(true);
    set_load_error('');
    try {
      start_quiz(await generate_quiz(quiz.skill_id, build_retake_details(quiz)));
    } catch (retake_error) {
      set_load_error(retake_error.message);
    } finally {
      set_is_retaking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {load_error && <AlertMessage>{load_error}</AlertMessage>}
      {is_retaking && <p role="status" className="text-small text-ink-muted">Writing a new quiz…</p>}
      {stage === QUIZ_STAGE.setup && !initial_quiz_id && (
        <QuizSetup
          initial_skill_id={initial_skill_id}
          initial_topic_id={initial_topic_id}
          initial_resource_id={initial_resource_id}
          on_quiz_ready={start_quiz}
        />
      )}
      {stage === QUIZ_STAGE.running && quiz && (
        <QuizRunner key={quiz.id} quiz={quiz} feedback_timing={feedback_timing} on_graded={show_results} />
      )}
      {stage === QUIZ_STAGE.results && <QuizResults quiz={quiz} graded={graded} on_retake={retake} />}
    </div>
  );
}

export default QuizWorkspace;
