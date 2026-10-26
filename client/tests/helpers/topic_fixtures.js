// A small skill map for skill-map tests, three levels deep:
//   Cells (weak) > Mitosis (untested) > Prophase (untested), and Genetics (strong).

export const SKILL = { id: 's1', name: 'Biology', color: '#4F46E5', resource_count: 1 };

export const TOPICS = [
  { id: 't1', topic: 'Cells', parent_node_id: null, mastery_score: 30, mastery_level: 'weak', resource_count: 1, summary: 'Units of life.' },
  { id: 't2', topic: 'Mitosis', parent_node_id: 't1', mastery_score: null, mastery_level: 'untested', resource_count: 1 },
  { id: 't3', topic: 'Genetics', parent_node_id: null, mastery_score: 90, mastery_level: 'strong', resource_count: 0 },
  { id: 't4', topic: 'Prophase', parent_node_id: 't2', mastery_score: null, mastery_level: 'untested', resource_count: 0 },
];

export const SUGGESTIONS = [{ topic_id: 't1', topic: 'Cells', mastery_level: 'weak', reason: 'Your recent score is 30%.' }];

export const RESOURCES = [
  { id: 'r1', title: 'Cell notes', resource_type: 'note', topic_id: 't1' },
  { id: 'r2', title: 'Mitosis video', resource_type: 'youtube', topic_id: 't2' },
  { id: 'r3', title: 'Textbook', resource_type: 'pdf', topic_id: null },
];

// A chain of `length` topics, each under the one before, for depth-limit tests.
export function build_topic_chain(length) {
  return Array.from({ length }, (_, level_index) => ({
    id: `c${level_index + 1}`,
    topic: `Level ${level_index + 1}`,
    parent_node_id: level_index === 0 ? null : `c${level_index}`,
    mastery_score: null,
    mastery_level: 'untested',
    resource_count: 0,
  }));
}
