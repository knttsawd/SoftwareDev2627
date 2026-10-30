import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_MAP_DETAIL_LEVEL } from '../../config/constants.js';
import { build_link_path, compute_topic_map_layout, select_focused_topics } from '../../utils/topic_map_layout.js';
import { build_topic_tree, get_tree_depth, list_topic_path } from '../../utils/topic_tree.js';
import { get_button_classes } from '../button_styles.js';
import TopicNode from './TopicNode.jsx';
import TopicOutline from './TopicOutline.jsx';

const VIEW_MODES = [
  { value: 'map', label: 'Map' },
  { value: 'outline', label: 'Outline' },
];
const CHOSEN_CLASSES = 'bg-brand-600 text-white';
const IDLE_CLASSES = 'bg-surface text-ink hover:bg-brand-50';

// A row of radio buttons styled as a segmented control. options are { value, label }.
function SegmentedControl({ legend, name, options, value, on_change }) {
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">{legend}</legend>
      <span aria-hidden="true" className="text-small text-ink-muted">
        {legend}
      </span>
      <div className="flex overflow-hidden rounded-lg border border-border">
        {options.map((option) => (
          <label
            key={option.value}
            className={`cursor-pointer px-3 py-1.5 text-small font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-600 ${value === option.value ? CHOSEN_CLASSES : IDLE_CLASSES}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => on_change(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The levels the map can show: 1 up to the deepest level.
export function build_detail_options(tree_depth) {
  return Array.from({ length: tree_depth }, (_, level_index) => ({ value: level_index + 1, label: String(level_index + 1) }));
}

// Where the map is centred, like a folder path: the whole skill, then each topic down to
// the focus. Each part before the last re-centres the map there (null = the whole skill).
function FocusPath({ skill_name, topics, focus_topic_id, on_focus_change }) {
  const path_topics = list_topic_path(topics, focus_topic_id);
  const link_classes = get_button_classes('ghost', 'px-2 py-1 text-small');
  return (
    <nav aria-label="Map centred on" className="flex flex-wrap items-center gap-1 text-small">
      <button type="button" onClick={() => on_focus_change(null)} className={link_classes}>
        All of {skill_name}
      </button>
      {path_topics.map((path_topic, path_index) => (
        <span key={path_topic.id} className="flex items-center gap-1">
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-ink-muted" />
          {path_index === path_topics.length - 1 ? (
            <span aria-current="location" className="px-2 font-semibold text-ink">
              {path_topic.topic}
            </span>
          ) : (
            <button type="button" onClick={() => on_focus_change(path_topic.id)} className={link_classes}>
              {path_topic.topic}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

// The topics as a radial tree around the skill (or the topic it's centred on), with faint
// rings for each level and curved links. The path to the chosen topic is highlighted.
// Lines are drawn in an SVG behind the buttons; both use the same percentage positions,
// so they line up at any size.
function MapView({ skill, topics, suggested_ids, selected_topic_id, visible_depth, focus_topic_id, on_open_topic }) {
  const { center, rings, nodes, links } = compute_topic_map_layout(topics, visible_depth, focus_topic_id);
  const center_name = topics.find((topic) => topic.id === focus_topic_id)?.topic ?? skill.name;
  const selected_path_ids = new Set(selected_topic_id ? list_topic_path(topics, selected_topic_id).map((topic) => topic.id) : []);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[42rem] overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_center,var(--color-brand-50),var(--color-surface)_70%)]">
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
        {rings.map((radius) => (
          <circle
            key={radius}
            cx={center.x}
            cy={center.y}
            r={radius}
            fill="none"
            strokeDasharray="0.6 1.2"
            vectorEffect="non-scaling-stroke"
            className="stroke-brand-200"
          />
        ))}
        {links.map((link) => (
          <path
            key={link.topic_id}
            d={build_link_path(link)}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth={selected_path_ids.has(link.topic_id) ? 3 : 1.5}
            className={selected_path_ids.has(link.topic_id) ? 'stroke-brand-600' : 'stroke-border'}
          />
        ))}
      </svg>
      <div
        style={{ left: `${center.x}%`, top: `${center.y}%`, boxShadow: `0 0 0 4px ${skill.color}` }}
        className="absolute flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-deep p-2 text-center text-caption leading-tight font-bold text-white shadow-lg [overflow-wrap:anywhere]"
      >
        {center_name}
      </div>
      <ul aria-label={`Topics in ${center_name}`}>
        {nodes.map((node) => (
          <li key={node.topic.id}>
            <TopicNode
              topic={node.topic}
              position={node}
              depth={node.depth}
              hidden_count={node.hidden_count}
              is_suggested={suggested_ids.has(node.topic.id)}
              is_selected={node.topic.id === selected_topic_id}
              is_crowded={node.is_crowded}
              on_open={on_open_topic}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// The skill map with a Map/Outline switch and, for the map, how many levels of detail to
// show. The map can be centred on one topic (focus_topic_id, changed with
// on_focus_change), so a deep branch gets the whole space. Phones always get the outline,
// since the map needs room. on_open_topic(topic) opens the chosen topic.
function TopicMap({ skill, topics, suggestions, selected_topic_id, focus_topic_id = null, on_focus_change, on_open_topic }) {
  const tree_depth = get_tree_depth(build_topic_tree(select_focused_topics(topics, focus_topic_id)));
  const [view_mode, set_view_mode] = useState('map');
  const [detail_level, set_detail_level] = useState(DEFAULT_MAP_DETAIL_LEVEL);
  const visible_depth = Math.min(detail_level, tree_depth);
  const suggested_ids = new Set(suggestions.map((suggestion) => suggestion.topic_id));
  const outline = (
    <TopicOutline
      topics={topics}
      suggested_ids={suggested_ids}
      selected_topic_id={selected_topic_id}
      on_open_topic={on_open_topic}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="hidden flex-wrap items-center justify-between gap-3 sm:flex">
        <SegmentedControl legend="Show as" name="topic-view" options={VIEW_MODES} value={view_mode} on_change={set_view_mode} />
        {view_mode === 'map' && tree_depth > 1 && (
          <SegmentedControl
            legend="Levels shown"
            name="topic-detail"
            options={build_detail_options(tree_depth)}
            value={visible_depth}
            on_change={set_detail_level}
          />
        )}
      </div>
      {view_mode === 'map' && focus_topic_id && (
        <div className="hidden sm:block">
          <FocusPath skill_name={skill.name} topics={topics} focus_topic_id={focus_topic_id} on_focus_change={on_focus_change} />
        </div>
      )}
      {view_mode === 'map' && (
        <div className="hidden sm:block">
          <MapView
            skill={skill}
            topics={topics}
            suggested_ids={suggested_ids}
            selected_topic_id={selected_topic_id}
            visible_depth={visible_depth}
            focus_topic_id={focus_topic_id}
            on_open_topic={on_open_topic}
          />
        </div>
      )}
      <div className={view_mode === 'map' ? 'sm:hidden' : ''}>{outline}</div>
    </div>
  );
}

export default TopicMap;
