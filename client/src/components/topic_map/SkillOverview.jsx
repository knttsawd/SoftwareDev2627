import { MASTERY_LEVEL_DETAILS, MASTERY_LEVEL_ORDER } from '../../config/mastery.js';
import { build_topic_tree, count_mastery_levels, get_tree_depth } from '../../utils/topic_tree.js';
import MasteryLegend from './MasteryLegend.jsx';

// The share of topics at each level, as percentages for the stacked bar.
export function compute_level_shares(counts) {
  const total = MASTERY_LEVEL_ORDER.reduce((sum, level) => sum + counts[level], 0);
  return MASTERY_LEVEL_ORDER.map((level) => ({ level, percent: total === 0 ? 0 : (counts[level] / total) * 100 }));
}

// A summary of the whole skill above the map: how many topics are strong, a bar split by
// level, the key with counts, and the size of the map. The bar is decoration; the key
// below it says the same thing in words.
function SkillOverview({ topics, resource_count }) {
  const counts = count_mastery_levels(topics);
  const level_count = get_tree_depth(build_topic_tree(topics));
  const facts = [
    { label: 'Topics', value: topics.length },
    { label: 'Levels', value: level_count },
    { label: 'Resources', value: resource_count },
  ];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">Understanding</p>
          <p className="font-display text-heading-3 font-semibold text-ink">
            {counts.strong} of {topics.length} topics strong
          </p>
        </div>
        <dl className="flex gap-6">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col">
              <dt className="text-caption text-ink-muted">{fact.label}</dt>
              <dd className="font-display text-lead font-semibold text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-canvas">
        {compute_level_shares(counts).map(({ level, percent }) => (
          <span key={level} style={{ width: `${percent}%` }} className={MASTERY_LEVEL_DETAILS[level].node_classes} />
        ))}
      </div>
      <MasteryLegend counts={counts} />
    </div>
  );
}

export default SkillOverview;
