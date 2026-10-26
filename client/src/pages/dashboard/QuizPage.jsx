import { useState } from 'react';
import { useSearchParams } from 'react-router';
import PageTitle from '../../components/PageTitle.jsx';
import QuizWorkspace from '../../components/quiz/QuizWorkspace.jsx';
import RecentResults from '../../components/quiz/RecentResults.jsx';
import AiStudentResults from '../../components/teach/AiStudentResults.jsx';
import { AI_STUDENT_NAME } from '../../config/constants.js';
import { get_feedback_timing } from '../../config/mastery.js';
import { use_auth } from '../../context/AuthContext.jsx';

// The Quiz page. The address chooses what to show:
//   ?quiz=<id>                  take that quiz straight away ("Take this quiz")
//   ?skill=<id>&topic=<id>      set up a quiz on a skill-map topic (from the map)
//   ?skill=<id>&resource=<id>   set up a quiz on one resource
//   nothing                     choose a skill and topic
// Below the student's quiz: the AI student's quizzes from recent lessons, with the
// combined teaching grades, and the student's recent results.
function QuizPage() {
  const { account } = use_auth();
  const [search_params] = useSearchParams();
  const [results_skill_id, set_results_skill_id] = useState(search_params.get('skill'));
  const [graded_count, set_graded_count] = useState(0);

  // After grading, show (and refresh) the results for the skill the quiz was in.
  function handle_finished(graded, finished_quiz) {
    set_graded_count((current_count) => current_count + 1);
    set_results_skill_id(finished_quiz.skill_id);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageTitle page_name="Quiz" />
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 font-bold text-ink">Quiz</h1>
        <p className="text-body text-ink-muted">
          Test yourself on a whole skill, one topic or a single resource. Scores on a topic, or on a resource filed
          under one, update that topic on your skill map.
        </p>
      </div>

      <section aria-labelledby="your-quiz-heading" className="flex flex-col gap-4">
        <h2 id="your-quiz-heading" className="text-heading-2 font-bold text-ink">
          Your quiz
        </h2>
        <QuizWorkspace
          key={search_params.toString()}
          initial_quiz_id={search_params.get('quiz')}
          initial_skill_id={search_params.get('skill')}
          initial_topic_id={search_params.get('topic')}
          initial_resource_id={search_params.get('resource')}
          feedback_timing={get_feedback_timing(account)}
          on_finished={handle_finished}
        />
      </section>

      <section aria-labelledby="ai-student-quiz-heading" className="flex flex-col gap-3">
        <h2 id="ai-student-quiz-heading" className="text-heading-2 font-bold text-ink">
          AI student's quiz
        </h2>
        <p className="text-small text-ink-muted">
          How {AI_STUDENT_NAME} did on the quiz after each lesson you taught, and your teaching grade.
        </p>
        <AiStudentResults />
      </section>

      {results_skill_id && (
        <section aria-labelledby="recent-results-heading" className="flex flex-col gap-3">
          <h2 id="recent-results-heading" className="text-heading-2 font-bold text-ink">
            Recent results
          </h2>
          <RecentResults skill_id={results_skill_id} refresh_key={graded_count} />
        </section>
      )}
    </div>
  );
}

export default QuizPage;
