import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { format_points } from '../../utils/progress.js';

// One list of topic changes: each topic, its skill, its first and latest score, and the
// change in words with an arrow.
function TopicChangeList({ heading_id, heading, topic_changes, empty_text, is_improvement }) {
  const ChangeIcon = is_improvement ? ArrowUpRight : ArrowDownRight;
  return (
    <section aria-labelledby={heading_id} className="flex flex-col gap-2">
      <h3 id={heading_id} className="text-lead font-semibold text-ink">
        {heading}
      </h3>
      {topic_changes.length === 0 ? (
        <p className="text-small text-ink-muted">{empty_text}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {topic_changes.map((topic_change) => (
            <li key={topic_change.topic_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold text-ink">{topic_change.topic}</span>
                <span className="text-caption text-ink-muted">
                  {topic_change.skill_name} · {topic_change.quiz_count} quizzes · {topic_change.first_score}% to{' '}
                  {topic_change.latest_score}%
                </span>
              </span>
              <span className={`flex items-center gap-1 text-small font-semibold ${is_improvement ? 'text-success' : 'text-danger'}`}>
                <ChangeIcon aria-hidden="true" className="h-4 w-4" />
                {is_improvement ? 'Up' : 'Down'} {format_points(Math.abs(topic_change.change))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Topics that improved most and topics that slipped most, from first to latest quiz.
function TopicChanges({ topic_changes }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <TopicChangeList
        heading_id="improved-topics-heading"
        heading="Most improved"
        topic_changes={topic_changes.improved}
        empty_text="Take a quiz on a topic more than once to see how it improves."
        is_improvement
      />
      <TopicChangeList
        heading_id="slipping-topics-heading"
        heading="Worth another look"
        topic_changes={topic_changes.slipping}
        empty_text="No topic has slipped since you first quizzed it."
        is_improvement={false}
      />
    </div>
  );
}

export default TopicChanges;
