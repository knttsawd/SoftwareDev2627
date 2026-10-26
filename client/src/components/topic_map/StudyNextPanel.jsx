import { ArrowRight, PartyPopper } from 'lucide-react';
import { MASTERY_LEVEL_DETAILS } from '../../config/mastery.js';
import { get_button_classes } from '../button_styles.js';

// The topics to study next, worst first, each with the reason and a quiz button.
// With topics but no suggestions, every topic is strong, which is worth saying.
function StudyNextPanel({ suggestions, has_topics, on_open_topic }) {
  if (!has_topics) return null;

  if (suggestions.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success bg-success-soft p-4 text-small text-success">
        <PartyPopper aria-hidden="true" className="h-5 w-5 shrink-0" />
        <p className="font-semibold">Every topic is strong. Add more resources or topics to keep growing.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="study-next-heading" className="flex flex-col gap-3">
      <h3 id="study-next-heading" className="text-heading-3 font-semibold text-ink">
        Study next
      </h3>
      <ol className="grid gap-3 md:grid-cols-3">
        {suggestions.map((suggestion) => {
          const { label, icon: LevelIcon } = MASTERY_LEVEL_DETAILS[suggestion.mastery_level];
          return (
            <li key={suggestion.topic_id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
              <span className="flex items-center gap-2 text-caption font-semibold text-ink-muted">
                <LevelIcon aria-hidden="true" className="h-4 w-4" />
                {label}
              </span>
              <p className="font-semibold text-ink">{suggestion.topic}</p>
              <p className="flex-1 text-small text-ink-muted">{suggestion.reason}</p>
              <button
                type="button"
                onClick={() => on_open_topic({ id: suggestion.topic_id, topic: suggestion.topic })}
                className={get_button_classes('secondary', 'self-start px-3 py-1.5 text-small')}
              >
                Quiz me on {suggestion.topic}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default StudyNextPanel;
