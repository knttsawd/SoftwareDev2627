import { describe_mastery, MASTERY_LEVEL_DETAILS } from '../../config/mastery.js';

// Node sizes by level: main topics are biggest, and everything from level 3 down is smallest.
const NODE_SIZES = [
  { circle: 'h-12 w-12', icon: 'h-6 w-6', label: 'w-28 text-small' },
  { circle: 'h-10 w-10', icon: 'h-5 w-5', label: 'w-24 text-caption' },
  { circle: 'h-8 w-8', icon: 'h-4 w-4', label: 'w-20 text-caption' },
];

export function get_node_size(depth) {
  return NODE_SIZES[Math.min(depth, NODE_SIZES.length) - 1];
}

// The words a screen reader hears for a topic button, e.g.
// "Photosynthesis: Needs work · 40%. Suggested next. 3 more subtopics. Open topic".
export function describe_topic_button(topic, is_suggested, hidden_count = 0) {
  const suggested_note = is_suggested ? ' Suggested next.' : '';
  const hidden_note = hidden_count > 0 ? ` ${hidden_count} more subtopics.` : '';
  return `${topic.topic}: ${describe_mastery(topic)}.${suggested_note}${hidden_note} Open topic`;
}

// One topic on the map: a colored circle with the level's icon, the name and level in
// words underneath. The chosen topic gets a dark ring; suggested topics a lighter ring and
// a "Next" tag; a "+3" badge counts subtopics hidden by the detail level. On a crowded
// ring the label is smaller, the level shows by icon and color only, and a suggestion by
// its ring only (the button's name still says both). position is { x, y } in percent of the map; on_open(topic) opens it.
function TopicNode({ topic, position, depth, is_suggested, is_selected, is_crowded = false, hidden_count = 0, on_open }) {
  const { icon: LevelIcon, node_classes } = MASTERY_LEVEL_DETAILS[topic.mastery_level];
  const size = get_node_size(is_crowded ? Math.max(depth, 2) : depth);
  let ring_classes = '';
  if (is_selected) ring_classes = 'ring-4 ring-brand-700 ring-offset-2 ring-offset-surface';
  else if (is_suggested) ring_classes = 'ring-2 ring-brand-500 ring-offset-2 ring-offset-surface';

  return (
    <button
      type="button"
      onClick={() => on_open(topic)}
      aria-label={describe_topic_button(topic, is_suggested, hidden_count)}
      aria-pressed={is_selected}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-xl p-1 text-center"
    >
      <span
        className={`relative flex items-center justify-center rounded-full shadow-md transition-transform group-hover:scale-110 ${node_classes} ${size.circle} ${ring_classes}`}
      >
        <LevelIcon aria-hidden="true" className={size.icon} />
        {hidden_count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-2 -right-3 rounded-full border border-border bg-surface px-1.5 text-caption font-semibold text-ink"
          >
            +{hidden_count}
          </span>
        )}
      </span>
      {is_suggested && !is_crowded && (
        <span aria-hidden="true" className="rounded-full bg-brand-600 px-2 text-caption font-semibold text-white">
          Next
        </span>
      )}
      <span
        aria-hidden="true"
        className={`line-clamp-2 rounded-md bg-surface/85 px-1 leading-tight text-ink ${size.label} ${is_selected ? 'font-bold' : 'font-semibold'}`}
      >
        {topic.topic}
      </span>
      {depth <= 2 && !is_crowded && (
        <span aria-hidden="true" className="text-caption leading-tight text-ink-muted">
          {describe_mastery(topic)}
        </span>
      )}
    </button>
  );
}

export default TopicNode;
