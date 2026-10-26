import { use_api_data } from '../../hooks/use_api_data.js';
import { fetch_recent_results } from '../../services/study_material_service.js';
import { format_date } from '../../utils/format.js';

// The student's latest quiz scores in one skill, newest first, each with a bar.
// refresh_key changes after a quiz is graded so the list reloads.
function RecentResults({ skill_id, refresh_key }) {
  const results_state = use_api_data(() => fetch_recent_results(skill_id), [skill_id, refresh_key]);
  const results = results_state.data ?? [];

  if (results_state.error) return <p className="text-small text-danger">{results_state.error}</p>;
  if (results.length === 0) {
    return <p className="text-small text-ink-muted">{results_state.is_loading ? 'Loading results…' : 'No quiz results yet.'}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {results.map((result) => (
        <li key={result.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-ink">{result.topic}</span>
            <span className="text-small text-ink">
              {result.score}% <span className="text-ink-muted">({result.correct_count}/{result.total_count})</span>
            </span>
          </div>
          <progress
            value={result.score}
            max={100}
            aria-label={`${result.topic}: ${result.score}%`}
            className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
          />
          <span className="text-caption text-ink-muted">{format_date(result.completed_at)}</span>
        </li>
      ))}
    </ul>
  );
}

export default RecentResults;
