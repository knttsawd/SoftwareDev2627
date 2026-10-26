import { build_topic_tree, flatten_topic_tree, get_tree_depth } from './topic_tree.js';

// Places skill-map topics as a radial tree, in percentages of a square map. The skill (or
// the topic the map is centred on) sits in the middle; each level of topics gets its own
// ring further out. Every topic gets a slice of its parent's slice, sized by how many end
// topics it holds (square-rooted, so one big branch can't squeeze its siblings together),
// so a branch's subtopics always sit together and never cross another branch. visible_depth hides levels below it; a node with hidden subtopics reports how
// many.

const CENTER = 50;
const OUTER_RING_RADIUS = 43;
// The first ring grows with the number of main topics, between these limits. A map with
// one level has the whole space for it; with more levels it leaves room for the outer rings.
const FIRST_RING_RADIUS = {
  single_level: { min: 28, max: 40 },
  more_levels: { min: 18, max: 24 },
};
// Roughly how much ring length one node and its label need, in percent of the map width.
const NODE_ARC_LENGTH = 15;
// Every other main topic on a crowded first ring moves this far toward the center, so
// neighbouring labels don't touch. Only the first ring has free space inside it; nodes on
// outer rings would run into their own parents.
const CROWDED_STAGGER = 5;
const START_ANGLE = -Math.PI / 2;
const FULL_TURN = 2 * Math.PI;

// A point on a ring around the center: angle in radians, 0 at 3 o'clock.
export function point_on_ring(angle, radius) {
  return {
    x: Math.round((CENTER + radius * Math.cos(angle)) * 10) / 10,
    y: Math.round((CENTER + radius * Math.sin(angle)) * 10) / 10,
  };
}

// The radius of each ring (index 0 for main topics). The first ring is just big enough for
// first_ring_count nodes; the rest spread evenly out to the edge.
export function compute_ring_radii(level_count, first_ring_count = 1) {
  if (level_count === 0) return [];
  const limits = level_count === 1 ? FIRST_RING_RADIUS.single_level : FIRST_RING_RADIUS.more_levels;
  const needed_radius = (first_ring_count * NODE_ARC_LENGTH) / FULL_TURN;
  const first_radius = Math.min(limits.max, Math.max(limits.min, needed_radius));
  if (level_count === 1) return [Math.round(first_radius * 10) / 10];
  const step = (OUTER_RING_RADIUS - first_radius) / (level_count - 1);
  return Array.from({ length: level_count }, (_, level_index) => Math.round((first_radius + level_index * step) * 10) / 10);
}

// How much of the circle a node needs: 1 for a node shown without children, otherwise the
// total of its shown children.
export function count_visible_leaves(tree_node, visible_depth) {
  if (tree_node.depth >= visible_depth || tree_node.children.length === 0) return 1;
  return tree_node.children.reduce((total, child) => total + count_visible_leaves(child, visible_depth), 0);
}

// How big a node's slice is compared with its siblings'.
export function get_slice_weight(tree_node, visible_depth) {
  return Math.sqrt(count_visible_leaves(tree_node, visible_depth));
}

// The topics under focus_topic_id, with its direct subtopics as the main topics, so the map
// can be centred on one branch. Without a focus, every topic.
export function select_focused_topics(topics, focus_topic_id) {
  if (!focus_topic_id) return topics;
  const focus_node = flatten_topic_tree(build_topic_tree(topics)).find((tree_node) => tree_node.topic.id === focus_topic_id);
  const branch_ids = new Set(flatten_topic_tree(focus_node?.children ?? []).map((tree_node) => tree_node.topic.id));
  return topics
    .filter((topic) => branch_ids.has(topic.id))
    .map((topic) => (topic.parent_node_id === focus_topic_id ? { ...topic, parent_node_id: null } : topic));
}

// True when two nodes on the ring sit closer than a label is wide. Rings of one or two
// nodes always have room.
export function is_ring_crowded(ring_nodes) {
  if (ring_nodes.length < 3) return false;
  return ring_nodes.some((node, node_index) =>
    ring_nodes
      .slice(node_index + 1)
      .some((other_node) => Math.hypot(other_node.x - node.x, other_node.y - node.y) < NODE_ARC_LENGTH),
  );
}

// On a crowded ring every node drops its level text, so the ring looks the same all the
// way round; on a crowded first ring, every other node also moves toward the center.
export function spread_crowded_rings(nodes, rings) {
  const crowded_depths = new Set(
    [...new Set(nodes.map((node) => node.depth))].filter((depth) =>
      is_ring_crowded(nodes.filter((node) => node.depth === depth)),
    ),
  );
  return nodes.map((node) => {
    if (!crowded_depths.has(node.depth)) return { ...node, is_crowded: false };
    if (node.depth > 1) return { ...node, is_crowded: true };
    const ring_index = nodes.filter((other_node) => other_node.depth === node.depth).indexOf(node);
    const radius = rings[0] - (ring_index % 2 === 0 ? 0 : CROWDED_STAGGER);
    return { ...node, ...point_on_ring(node.angle, radius), is_crowded: true };
  });
}

// Returns { center, rings, nodes: [{ topic, x, y, angle, depth, parent_id, hidden_count,
// is_crowded }], links: [{ from, to, topic_id }] }. rings are the radii in use, for
// drawing guide circles. focus_topic_id centres the map on one topic's branch.
export function compute_topic_map_layout(topics, visible_depth = Infinity, focus_topic_id = null) {
  const center = { x: CENTER, y: CENTER };
  const tree = build_topic_tree(select_focused_topics(topics, focus_topic_id));
  const rings = compute_ring_radii(Math.min(visible_depth, get_tree_depth(tree)), tree.length);
  const placed_nodes = [];

  // Lays out sibling nodes across the slice from start_angle, each getting a share of
  // slice_angle in proportion to its slice weight.
  function place_children(children, start_angle, slice_angle, parent_id) {
    const total_weight = children.reduce((total, child) => total + get_slice_weight(child, visible_depth), 0);
    let child_start = start_angle;
    for (const child of children) {
      const child_slice = (slice_angle * get_slice_weight(child, visible_depth)) / total_weight;
      const angle = child_start + child_slice / 2;
      const is_cut_off = child.depth >= visible_depth;
      placed_nodes.push({
        topic: child.topic,
        ...point_on_ring(angle, rings[child.depth - 1]),
        angle,
        depth: child.depth,
        parent_id,
        hidden_count: is_cut_off ? flatten_topic_tree(child.children).length : 0,
      });
      if (!is_cut_off) place_children(child.children, child_start, child_slice, child.topic.id);
      child_start += child_slice;
    }
  }

  if (tree.length > 0) {
    // Turn the circle so the first main topic sits at 12 o'clock.
    const total_weight = tree.reduce((total, tree_node) => total + get_slice_weight(tree_node, visible_depth), 0);
    const first_slice = (FULL_TURN * get_slice_weight(tree[0], visible_depth)) / total_weight;
    place_children(tree, START_ANGLE - first_slice / 2, FULL_TURN, null);
  }

  const nodes = spread_crowded_rings(placed_nodes, rings);
  const points_by_id = new Map(nodes.map((node) => [node.topic.id, { x: node.x, y: node.y }]));
  const links = nodes.map((node) => ({
    from: node.parent_id ? points_by_id.get(node.parent_id) : center,
    to: { x: node.x, y: node.y },
    topic_id: node.topic.id,
  }));
  return { center, rings, nodes, links };
}

// An SVG path for a link that curves along the rings: the control point sits on the
// parent's ring in the child's direction, so links bend outward like branches. Links from
// the center are straight.
export function build_link_path(link) {
  const parent_radius = Math.hypot(link.from.x - CENTER, link.from.y - CENTER);
  const child_radius = Math.hypot(link.to.x - CENTER, link.to.y - CENTER);
  const scale = child_radius === 0 ? 0 : parent_radius / child_radius;
  const control_x = Math.round((CENTER + (link.to.x - CENTER) * scale) * 10) / 10;
  const control_y = Math.round((CENTER + (link.to.y - CENTER) * scale) * 10) / 10;
  return `M ${link.from.x} ${link.from.y} Q ${control_x} ${control_y} ${link.to.x} ${link.to.y}`;
}
