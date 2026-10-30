import { MASTERY_LEVEL_ORDER } from '../config/mastery.js';

// Helpers for topics nested like folders: topic.parent_node_id points at the broader topic,
// or is null for a main topic.

// The topics as a tree: [{ topic, depth, children: [...] }], in the order they were added.
// Main topics have depth 1. A topic whose parent is missing becomes a main topic, and a
// loop of parent links is broken at the first topic reached, so every topic appears once.
export function build_topic_tree(topics) {
  const topic_ids = new Set(topics.map((topic) => topic.id));
  const children_by_parent = new Map();
  for (const topic of topics) {
    const parent_id = topic_ids.has(topic.parent_node_id) ? topic.parent_node_id : null;
    children_by_parent.set(parent_id, [...(children_by_parent.get(parent_id) ?? []), topic]);
  }

  const placed_ids = new Set();
  function build_node(topic, depth) {
    placed_ids.add(topic.id);
    const children = (children_by_parent.get(topic.id) ?? [])
      .filter((child) => !placed_ids.has(child.id))
      .map((child) => build_node(child, depth + 1));
    return { topic, depth, children };
  }

  const roots = (children_by_parent.get(null) ?? []).map((topic) => build_node(topic, 1));
  for (const topic of topics) {
    if (!placed_ids.has(topic.id)) roots.push(build_node(topic, 1));
  }
  return roots;
}

// Every node of a tree, parents before their children.
export function flatten_topic_tree(tree_nodes) {
  return tree_nodes.flatMap((tree_node) => [tree_node, ...flatten_topic_tree(tree_node.children)]);
}

// The deepest level in the tree (0 with no topics).
export function get_tree_depth(tree_nodes) {
  return Math.max(0, ...flatten_topic_tree(tree_nodes).map((tree_node) => tree_node.depth));
}

// The topic's id plus the ids of every topic under it, at any depth. Matches the server,
// which counts resources filed under subtopics as part of the broader topic.
export function list_branch_topic_ids(topics, topic_id) {
  const branch_ids = new Set([topic_id]);
  let found_new_topic = true;
  while (found_new_topic) {
    found_new_topic = false;
    for (const topic of topics) {
      if (branch_ids.has(topic.parent_node_id) && !branch_ids.has(topic.id)) {
        branch_ids.add(topic.id);
        found_new_topic = true;
      }
    }
  }
  return branch_ids;
}

// The topic's direct subtopics, in the order they were added.
export function list_child_topics(topics, topic_id) {
  return topics.filter((topic) => topic.parent_node_id === topic_id && topic.id !== topic_id);
}

// The topics from the main topic down to this one, like a folder path. Stops at a loop.
export function list_topic_path(topics, topic_id) {
  const topics_by_id = new Map(topics.map((topic) => [topic.id, topic]));
  const path = [];
  let current_topic = topics_by_id.get(topic_id);
  while (current_topic && !path.includes(current_topic)) {
    path.unshift(current_topic);
    current_topic = topics_by_id.get(current_topic.parent_node_id);
  }
  return path;
}

// How many of the topics are at each mastery level: { strong, developing, weak, untested }.
export function count_mastery_levels(topics) {
  const counts = Object.fromEntries(MASTERY_LEVEL_ORDER.map((level) => [level, 0]));
  for (const topic of topics) counts[topic.mastery_level] += 1;
  return counts;
}

// The same counts for the topics under one topic, at any depth.
export function count_branch_levels(topics, topic_id) {
  const branch_ids = list_branch_topic_ids(topics, topic_id);
  return count_mastery_levels(topics.filter((topic) => topic.id !== topic_id && branch_ids.has(topic.id)));
}

// The topics a topic could move under: everything outside its own branch.
export function list_possible_parents(topics, topic_id) {
  const branch_ids = list_branch_topic_ids(topics, topic_id);
  return topics.filter((topic) => !branch_ids.has(topic.id));
}

// The resources filed under a topic or its subtopics, each with in_subtopic set to the
// subtopic's name when it isn't filed under the topic itself.
export function list_topic_resources(topics, resources, topic_id) {
  const branch_ids = list_branch_topic_ids(topics, topic_id);
  return resources
    .filter((resource) => branch_ids.has(resource.topic_id))
    .map((resource) => ({
      ...resource,
      in_subtopic: resource.topic_id === topic_id ? null : topics.find((topic) => topic.id === resource.topic_id)?.topic ?? null,
    }));
}

// A topic's name from its id, or null for none or an unknown id.
export function find_topic_name(topics, topic_id) {
  return topics.find((topic) => topic.id === topic_id)?.topic ?? null;
}

// "Cells", "— Membranes", "— — Channels": a topic's name indented by its depth, for
// dropdowns, which can't nest.
export function format_indented_name(tree_node) {
  return `${'— '.repeat(tree_node.depth - 1)}${tree_node.topic.topic}`;
}
