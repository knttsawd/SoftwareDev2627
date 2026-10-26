import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_MAP_DETAIL_LEVEL } from '../../config/constants.js';
import { describe_mastery, MASTERY_LEVEL_DETAILS } from '../../config/mastery.js';
import { build_topic_tree, flatten_topic_tree, list_topic_path } from '../../utils/topic_tree.js';
import { get_button_classes } from '../button_styles.js';
import { describe_topic_button } from './TopicNode.jsx';

// "Not tested · 2 subtopics · 1 resource": a topic's level and what it holds.
export function describe_outline_row(tree_node) {
  const parts = [describe_mastery(tree_node.topic)];
  const subtopic_count = tree_node.children.length;
  const resource_count = tree_node.topic.resource_count ?? 0;
  if (subtopic_count > 0) parts.push(`${subtopic_count} ${subtopic_count === 1 ? 'subtopic' : 'subtopics'}`);
  if (resource_count > 0) parts.push(`${resource_count} ${resource_count === 1 ? 'resource' : 'resources'}`);
  return parts.join(' · ');
}

// The ids of the topics open at first: every topic above DEFAULT_MAP_DETAIL_LEVEL, so the
// outline starts showing the same levels as the map.
export function get_initially_expanded_ids(tree) {
  return new Set(
    flatten_topic_tree(tree)
      .filter((tree_node) => tree_node.depth < DEFAULT_MAP_DETAIL_LEVEL && tree_node.children.length > 0)
      .map((tree_node) => tree_node.topic.id),
  );
}

// One level of the outline. Each row has a show/hide button (when the topic has
// subtopics) and the topic itself, which opens it; open rows show their subtopics,
// indented under a guide line like folders in a file browser.
function OutlineLevel({ tree_nodes, expanded_ids, selected_topic_id, suggested_ids, on_toggle, on_open_topic }) {
  return (
    <ul className={tree_nodes[0]?.depth > 1 ? 'ml-4 flex flex-col gap-0.5 border-l-2 border-border pl-2' : 'flex flex-col gap-0.5'}>
      {tree_nodes.map((tree_node) => {
        const { topic, children } = tree_node;
        const { icon: LevelIcon, node_classes } = MASTERY_LEVEL_DETAILS[topic.mastery_level];
        const is_expanded = expanded_ids.has(topic.id);
        const is_selected = topic.id === selected_topic_id;
        const is_suggested = suggested_ids.has(topic.id);
        return (
          <li key={topic.id}>
            <div className={`flex items-center gap-1 rounded-lg pr-2 ${is_selected ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-canvas'}`}>
              {children.length > 0 ? (
                <button
                  type="button"
                  onClick={() => on_toggle(topic.id)}
                  aria-expanded={is_expanded}
                  aria-label={`${is_expanded ? 'Hide' : 'Show'} subtopics of ${topic.topic}`}
                  className={get_button_classes('ghost', 'h-8 w-8 shrink-0 px-0 py-0')}
                >
                  <ChevronRight aria-hidden="true" className={`h-4 w-4 transition-transform ${is_expanded ? 'rotate-90' : ''}`} />
                </button>
              ) : (
                <span aria-hidden="true" className="h-8 w-8 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => on_open_topic(topic)}
                aria-label={describe_topic_button(topic, is_suggested)}
                aria-pressed={is_selected}
                className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${node_classes}`}>
                  <LevelIcon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-ink ${is_selected ? 'font-bold' : 'font-semibold'}`}>{topic.topic}</span>
                  <span className="truncate text-caption text-ink-muted">{describe_outline_row(tree_node)}</span>
                </span>
                {is_suggested && (
                  <span aria-hidden="true" className="rounded-full bg-brand-600 px-2 text-caption font-semibold text-white">
                    Next
                  </span>
                )}
              </button>
            </div>
            {is_expanded && children.length > 0 && (
              <OutlineLevel
                tree_nodes={children}
                expanded_ids={expanded_ids}
                selected_topic_id={selected_topic_id}
                suggested_ids={suggested_ids}
                on_toggle={on_toggle}
                on_open_topic={on_open_topic}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The topics as a folder-style outline with every level of detail. The chosen topic's
// parents open automatically, so it's always visible.
function TopicOutline({ topics, suggested_ids, selected_topic_id, on_open_topic }) {
  const tree = build_topic_tree(topics);
  const [expanded_ids, set_expanded_ids] = useState(() => get_initially_expanded_ids(tree));
  const branch_ids = flatten_topic_tree(tree)
    .filter((tree_node) => tree_node.children.length > 0)
    .map((tree_node) => tree_node.topic.id);

  useEffect(() => {
    if (!selected_topic_id) return;
    const ancestor_ids = list_topic_path(topics, selected_topic_id)
      .slice(0, -1)
      .map((topic) => topic.id);
    set_expanded_ids((current_ids) => new Set([...current_ids, ...ancestor_ids]));
  }, [selected_topic_id, topics]);

  function toggle_topic(topic_id) {
    set_expanded_ids((current_ids) => {
      const next_ids = new Set(current_ids);
      if (next_ids.has(topic_id)) next_ids.delete(topic_id);
      else next_ids.add(topic_id);
      return next_ids;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {branch_ids.length > 0 && (
        <div className="flex gap-2 self-end">
          <button type="button" onClick={() => set_expanded_ids(new Set(branch_ids))} className={get_button_classes('ghost', 'px-2 py-1 text-small')}>
            Expand all
          </button>
          <button type="button" onClick={() => set_expanded_ids(new Set())} className={get_button_classes('ghost', 'px-2 py-1 text-small')}>
            Collapse all
          </button>
        </div>
      )}
      <OutlineLevel
        tree_nodes={tree}
        expanded_ids={expanded_ids}
        selected_topic_id={selected_topic_id}
        suggested_ids={suggested_ids}
        on_toggle={toggle_topic}
        on_open_topic={on_open_topic}
      />
    </div>
  );
}

export default TopicOutline;
