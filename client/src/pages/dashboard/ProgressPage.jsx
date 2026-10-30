import AlertMessage from '../../components/AlertMessage.jsx';
import PageTitle from '../../components/PageTitle.jsx';
import SkillProgressList from '../../components/progress/SkillProgressList.jsx';
import StatTile from '../../components/progress/StatTile.jsx';
import StudyTimeChart from '../../components/progress/StudyTimeChart.jsx';
import TopicChanges from '../../components/progress/TopicChanges.jsx';
import { AI_STUDENT_NAME } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { fetch_progress } from '../../services/progress_service.js';
import { describe_change, format_minutes } from '../../utils/progress.js';

// "73%", or a dash when there's nothing to average yet.
export function format_percent_value(percent) {
  return percent === null ? '–' : `${percent}%`;
}

// The headline numbers: quiz scores, focus time, strong topics and teaching grade, each
// compared with the period before where that makes sense.
export function build_stat_tiles(progress) {
  const { quiz_scores, study_minutes, teaching, totals } = progress;
  return [
    {
      label: `Average quiz score, last ${quiz_scores.period_days} days`,
      value: format_percent_value(quiz_scores.recent),
      change: describe_change(quiz_scores.change, quiz_scores.period_days),
    },
    {
      label: `Focus time, last ${study_minutes.period_days} days`,
      value: format_minutes(study_minutes.recent),
      change: describe_change(study_minutes.change, study_minutes.period_days, format_minutes),
    },
    {
      label: 'Topics strong',
      value: `${totals.topics_strong} of ${totals.topics_total}`,
      detail: `${totals.quizzes_taken} ${totals.quizzes_taken === 1 ? 'quiz' : 'quizzes'} taken in all`,
    },
    {
      label: `Teaching grade, last ${teaching.grades.period_days} days`,
      value: format_percent_value(teaching.grades.recent),
      detail: `${teaching.lessons_done} ${teaching.lessons_done === 1 ? 'lesson' : 'lessons'} with ${AI_STUDENT_NAME} in all`,
      change: describe_change(teaching.grades.change, teaching.grades.period_days),
    },
  ];
}

// The Progress page: progress bars and improvement metrics only. It compares each period
// with the one before it and never counts streaks or hands out badges or levels.
// now is injectable for tests.
function ProgressPage({ now = new Date() }) {
  const progress_state = use_api_data(fetch_progress, []);
  const progress = progress_state.data;

  return (
    <div className="flex flex-col gap-8">
      <PageTitle page_name="Progress" />
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 font-bold text-ink">Progress</h1>
        <p className="text-body text-ink-muted">How far along each skill is, and how this month and week compare with the ones before.</p>
      </div>
      {progress_state.error && <AlertMessage>{progress_state.error}</AlertMessage>}
      {!progress && !progress_state.error && <p className="text-small text-ink-muted">Loading your progress…</p>}
      {progress && (
        <>
          <ul aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {build_stat_tiles(progress).map((stat_tile) => (
              <li key={stat_tile.label}>
                <StatTile {...stat_tile} />
              </li>
            ))}
          </ul>
          <section aria-labelledby="skill-progress-heading" className="flex flex-col gap-3">
            <h2 id="skill-progress-heading" className="text-heading-2 font-bold text-ink">
              Skills
            </h2>
            <SkillProgressList skills={progress.skills} />
          </section>
          <section aria-labelledby="focus-time-heading" className="flex flex-col gap-3">
            <h2 id="focus-time-heading" className="text-heading-2 font-bold text-ink">
              Focus time per day
            </h2>
            <p className="text-small text-ink-muted">Minutes recorded by work blocks over the last two weeks.</p>
            <StudyTimeChart work_blocks={progress.recent_work_blocks} now={now} />
          </section>
          <section aria-labelledby="topic-changes-heading" className="flex flex-col gap-3">
            <h2 id="topic-changes-heading" className="text-heading-2 font-bold text-ink">
              Topics since your first quiz
            </h2>
            <TopicChanges topic_changes={progress.topic_changes} />
          </section>
        </>
      )}
    </div>
  );
}

export default ProgressPage;
