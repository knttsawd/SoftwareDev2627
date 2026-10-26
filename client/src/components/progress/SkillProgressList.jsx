import { Link } from 'react-router';
import { ROUTE_PATHS } from '../../config/constants.js';
import { get_button_classes } from '../button_styles.js';

// One labelled progress bar. The label and percent are text, so the bar is only a picture
// of what they already say.
function ProgressBar({ label, percent, skill_name, fill_classes }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-small text-ink">
        <span>{label}</span>
        <span className="font-semibold">{percent}%</span>
      </div>
      <progress
        value={percent}
        max={100}
        aria-label={`${skill_name}, ${label.toLowerCase()}: ${percent}%`}
        className={`h-2 w-full overflow-hidden rounded-full ${fill_classes}`}
      />
    </div>
  );
}

// "4 topics · 2 resources · average 67%".
export function describe_skill_facts(skill_progress) {
  const facts = [
    `${skill_progress.topic_count} ${skill_progress.topic_count === 1 ? 'topic' : 'topics'}`,
    `${skill_progress.resource_count} ${skill_progress.resource_count === 1 ? 'resource' : 'resources'}`,
  ];
  if (skill_progress.average_mastery !== null) facts.push(`average ${skill_progress.average_mastery}%`);
  return facts.join(' · ');
}

// Each skill's progress: how much of it has been quizzed, and how much is strong.
function SkillProgressList({ skills }) {
  if (skills.length === 0) {
    return (
      <p className="text-body text-ink">
        Add a skill on the{' '}
        <Link to={`${ROUTE_PATHS.dashboard}/skill-map`} className="font-semibold text-brand-700 underline">
          skill map
        </Link>{' '}
        to start tracking your progress.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {skills.map((skill_progress) => (
        <li key={skill_progress.skill_id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: skill_progress.color }} />
            <h3 className="min-w-0 flex-1 truncate text-lead font-semibold text-ink">{skill_progress.name}</h3>
          </div>
          <p className="text-caption text-ink-muted">{describe_skill_facts(skill_progress)}</p>
          {skill_progress.topic_count === 0 ? (
            <Link
              to={`${ROUTE_PATHS.dashboard}/skill-map?skill=${skill_progress.skill_id}`}
              className={get_button_classes('secondary', 'self-start px-3 py-1.5 text-small')}
            >
              Add topics to {skill_progress.name}
            </Link>
          ) : (
            <>
              <ProgressBar
                label="Topics quizzed"
                percent={skill_progress.quizzed_percent}
                skill_name={skill_progress.name}
                fill_classes="[&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
              />
              <ProgressBar
                label="Topics strong"
                percent={skill_progress.strong_percent}
                skill_name={skill_progress.name}
                fill_classes="[&::-moz-progress-bar]:bg-mastery-strong [&::-webkit-progress-bar]:bg-success-soft [&::-webkit-progress-value]:bg-mastery-strong"
              />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default SkillProgressList;
