import { MousePointerClick, X } from 'lucide-react';
import { get_button_classes } from '../button_styles.js';
import TopicDetails from './TopicDetails.jsx';

// The topic's details beside the map, used on wide screens. With no topic chosen it says
// what choosing one does. It is a named section (a region), not an aside, because it sits
// inside the page's main content. detail_props are passed straight to TopicDetails.
function TopicPanel({ topic, on_close, ...detail_props }) {
  if (!topic) {
    return (
      <section
        aria-label="Topic details"
        className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-surface p-5 text-small text-ink-muted lg:sticky lg:top-6"
      >
        <MousePointerClick aria-hidden="true" className="h-6 w-6 text-brand-700" />
        <p>
          Choose a topic to see its subtopics and resources, add more detail, or quiz yourself and teach it to the AI
          student.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="topic-panel-heading"
      className="flex max-h-[calc(100vh-3rem)] flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id="topic-panel-heading" className="text-heading-3 font-bold text-ink">
          {topic.topic}
        </h3>
        <button type="button" onClick={on_close} className={get_button_classes('ghost', 'px-2 py-1')}>
          <X aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Close topic details</span>
        </button>
      </div>
      <TopicDetails key={topic.id} topic={topic} section_heading="h4" {...detail_props} />
    </section>
  );
}

export default TopicPanel;
