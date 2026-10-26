import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL, SUGGESTIONS, TOPICS } from './helpers/topic_fixtures.js';

vi.mock('../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue('response') }));
vi.mock('../src/services/topic_service.js', async (import_original) => ({
  ...(await import_original()),
  add_topic: vi.fn(),
  generate_topics: vi.fn(),
}));

const { send_authed_request } = await import('../src/services/auth_service.js');
const topic_service = await import('../src/services/topic_service.js');
const { describe_mastery, get_feedback_timing } = await import('../src/config/mastery.js');
const {
  build_link_path,
  compute_ring_radii,
  compute_topic_map_layout,
  count_visible_leaves,
  get_slice_weight,
  is_ring_crowded,
  point_on_ring,
  select_focused_topics,
  spread_crowded_rings,
} = await import('../src/utils/topic_map_layout.js');
const { build_topic_tree } = await import('../src/utils/topic_tree.js');
const { build_quiz_path, build_teach_path } = await import('../src/utils/study_paths.js');
const { default: MasteryLegend } = await import('../src/components/topic_map/MasteryLegend.jsx');
const { compute_level_shares, default: SkillOverview } = await import('../src/components/topic_map/SkillOverview.jsx');
const { default: TopicNode, describe_topic_button, get_node_size } = await import('../src/components/topic_map/TopicNode.jsx');
const { describe_outline_row, get_initially_expanded_ids, default: TopicOutline } = await import(
  '../src/components/topic_map/TopicOutline.jsx'
);
const { build_detail_options, default: TopicMap } = await import('../src/components/topic_map/TopicMap.jsx');
const { default: StudyNextPanel } = await import('../src/components/topic_map/StudyNextPanel.jsx');
const { default: TopicManager } = await import('../src/components/topic_map/TopicManager.jsx');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mastery config', () => {
  it('describes a level in words, with the score when there is one', () => {
    expect(describe_mastery(TOPICS[0])).toBe('Needs work · 30%');
    expect(describe_mastery(TOPICS[1])).toBe('Not tested');
  });

  it('reads the feedback timing preference, defaulting to the end', () => {
    expect(get_feedback_timing({ learning_profile: { feedback_timing: 'after_each' } })).toBe('after_each');
    expect(get_feedback_timing({ learning_profile: {} })).toBe('at_end');
    expect(get_feedback_timing(null)).toBe('at_end');
  });
});

describe('topic service', () => {
  it('calls the topic endpoints', async () => {
    const real_service = await vi.importActual('../src/services/topic_service.js');

    await real_service.fetch_topic_map('s1');
    await real_service.add_topic('s1', { topic: 'Cells' });
    await real_service.generate_topics('s1');
    await real_service.delete_topic('t1');
    await real_service.update_topic('t1', { parent_topic_id: null });
    await real_service.generate_subtopics('t1');

    expect(send_authed_request.mock.calls).toEqual([
      ['/skills/s1/topics'],
      ['/skills/s1/topics', { method: 'POST', body: { topic: 'Cells' } }],
      ['/skills/s1/topics/generate', { method: 'POST' }],
      ['/topics/t1', { method: 'DELETE' }],
      ['/topics/t1', { method: 'PATCH', body: { parent_topic_id: null } }],
      ['/topics/t1/generate', { method: 'POST' }],
    ]);
  });
});

describe('study paths', () => {
  it('builds quiz addresses for a topic or a resource', () => {
    expect(build_quiz_path({ skill_id: 's1', topic_id: 't 1' })).toBe('/dashboard/quiz?skill=s1&topic=t+1');
    expect(build_quiz_path({ skill_id: 's1', resource_id: 'r1' })).toBe('/dashboard/quiz?skill=s1&resource=r1');
  });

  it('builds teach page addresses for a lesson or a topic', () => {
    expect(build_teach_path({ session_id: 'l1' })).toBe('/dashboard/teach?session=l1');
    expect(build_teach_path({ skill_id: 's1', topic_id: 't1' })).toBe('/dashboard/teach?skill=s1&topic=t1');
    expect(build_teach_path({})).toBe('/dashboard/teach');
  });
});

describe('topic map layout', () => {
  it('places points on a ring and spreads the rings out to the edge', () => {
    expect(point_on_ring(0, 10)).toEqual({ x: 60, y: 50 });
    expect(point_on_ring(-Math.PI / 2, 10)).toEqual({ x: 50, y: 40 });
    expect(compute_ring_radii(0)).toEqual([]);
    expect(compute_ring_radii(1)).toEqual([28]);
    expect(compute_ring_radii(1, 20)).toEqual([40]);
    expect(compute_ring_radii(3)).toEqual([18, 30.5, 43]);
    expect(compute_ring_radii(3, 12)).toEqual([24, 33.5, 43]);
  });

  it('gives each branch room for its end topics, up to the visible depth', () => {
    const [cells] = build_topic_tree(TOPICS);

    expect(count_visible_leaves(cells, Infinity)).toBe(1);
    expect(count_visible_leaves({ depth: 1, children: [{ depth: 2, children: [] }, { depth: 2, children: [] }] }, Infinity)).toBe(2);
    expect(count_visible_leaves(cells, 1)).toBe(1);
    expect(get_slice_weight({ depth: 1, children: [1, 2, 3, 4].map(() => ({ depth: 2, children: [] })) }, Infinity)).toBe(2);
  });

  it('puts every level on its own ring, the first main topic at the top', () => {
    const { center, rings, nodes, links } = compute_topic_map_layout(TOPICS);

    expect(center).toEqual({ x: 50, y: 50 });
    expect(rings).toHaveLength(3);
    expect(nodes.map((node) => [node.topic.id, node.depth, node.parent_id])).toEqual([
      ['t1', 1, null],
      ['t2', 2, 't1'],
      ['t4', 3, 't2'],
      ['t3', 1, null],
    ]);
    expect(nodes[0]).toMatchObject({ x: 50, y: 32 });
    expect(links).toHaveLength(4);
    expect(links[1]).toEqual({ from: { x: nodes[0].x, y: nodes[0].y }, to: { x: nodes[1].x, y: nodes[1].y }, topic_id: 't2' });
  });

  it('hides levels below the visible depth and counts what is hidden', () => {
    const { rings, nodes } = compute_topic_map_layout(TOPICS, 1);

    expect(rings).toEqual([28]);
    expect(nodes.map((node) => [node.topic.id, node.hidden_count])).toEqual([
      ['t1', 2],
      ['t3', 0],
    ]);
    expect(compute_topic_map_layout([]).nodes).toEqual([]);
  });

  it('centres on one branch, its subtopics becoming the main topics', () => {
    expect(select_focused_topics(TOPICS, null)).toBe(TOPICS);
    expect(select_focused_topics(TOPICS, 't1')).toEqual([
      { ...TOPICS[1], parent_node_id: null },
      TOPICS[3],
    ]);
    expect(compute_topic_map_layout(TOPICS, Infinity, 't1').nodes.map((node) => [node.topic.id, node.depth])).toEqual([
      ['t2', 1],
      ['t4', 2],
    ]);
    expect(select_focused_topics(TOPICS, 'missing')).toEqual([]);
  });

  it('staggers a crowded ring and marks its nodes', () => {
    const many_topics = Array.from({ length: 12 }, (_, index) => ({ ...TOPICS[2], id: `m${index}`, topic: `Topic ${index}` }));
    const child_topics = many_topics.map((topic) => ({ ...topic, id: `${topic.id}-child`, parent_node_id: topic.id }));
    const { nodes, rings } = compute_topic_map_layout([...many_topics, ...child_topics]);

    const first_ring = nodes.filter((node) => node.depth === 1);
    expect(first_ring.every((node) => node.is_crowded)).toBe(true);
    expect(Math.hypot(first_ring[0].x - 50, first_ring[0].y - 50)).toBeCloseTo(rings[0], 0);
    expect(Math.hypot(first_ring[1].x - 50, first_ring[1].y - 50)).toBeCloseTo(rings[0] - 5, 0);
    expect(spread_crowded_rings([{ depth: 1, x: 1, y: 1 }], [10])).toEqual([{ depth: 1, x: 1, y: 1, is_crowded: false }]);
    expect(is_ring_crowded([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }])).toBe(false);
    expect(is_ring_crowded([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 45, y: 0 }])).toBe(true);
  });

  it('draws links from the center straight, and others curving along the rings', () => {
    expect(build_link_path({ from: { x: 50, y: 50 }, to: { x: 50, y: 30 } })).toBe('M 50 50 Q 50 50 50 30');
    expect(build_link_path({ from: { x: 50, y: 30 }, to: { x: 70, y: 50 } })).toBe('M 50 30 Q 70 50 70 50');
  });
});

describe('MasteryLegend and SkillOverview', () => {
  it('names every level with its meaning, and counts when given', () => {
    render(<MasteryLegend counts={{ strong: 1, developing: 0, weak: 1, untested: 2 }} />);

    expect(screen.getByRole('list', { name: 'Map key' })).toHaveTextContent('Needs work (1): Under 50% on recent quizzes');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('splits the bar by level', () => {
    expect(compute_level_shares({ strong: 1, developing: 0, weak: 1, untested: 2 }).map((share) => share.percent)).toEqual([
      25, 0, 25, 50,
    ]);
    expect(compute_level_shares({ strong: 0, developing: 0, weak: 0, untested: 0 })[0].percent).toBe(0);
  });

  it('sums up the skill', () => {
    render(<SkillOverview topics={TOPICS} resource_count={3} />);

    expect(screen.getByText('1 of 4 topics strong')).toBeInTheDocument();
    expect(screen.getByText('Levels').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Resources').nextSibling).toHaveTextContent('3');
  });
});

describe('TopicNode', () => {
  it('is a button named with the topic, its level, whether it is suggested and what is hidden', async () => {
    const on_open = vi.fn();
    render(<TopicNode topic={TOPICS[0]} position={{ x: 10, y: 20 }} depth={1} is_suggested is_selected hidden_count={2} on_open={on_open} />);

    const node_button = screen.getByRole('button', { name: 'Cells: Needs work · 30%. Suggested next. 2 more subtopics. Open topic' });
    expect(node_button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(node_button);
    expect(on_open).toHaveBeenCalledWith(TOPICS[0]);
    expect(describe_topic_button(TOPICS[2], false)).toBe('Genetics: Strong · 90%. Open topic');
  });

  it('gets smaller with each level, down to a smallest size', () => {
    expect(get_node_size(1).circle).toBe('h-12 w-12');
    expect(get_node_size(3)).toBe(get_node_size(6));
  });
});

describe('TopicOutline', () => {
  it('describes what each topic holds', () => {
    const [cells, genetics] = build_topic_tree(TOPICS);

    expect(describe_outline_row(cells)).toBe('Needs work · 30% · 1 subtopic · 1 resource');
    expect(describe_outline_row(genetics)).toBe('Strong · 90%');
    expect([...get_initially_expanded_ids(build_topic_tree(TOPICS))]).toEqual(['t1']);
  });

  it('shows topics like folders that open and close', async () => {
    const on_open_topic = vi.fn();
    render(<TopicOutline topics={TOPICS} suggested_ids={new Set(['t1'])} selected_topic_id={null} on_open_topic={on_open_topic} />);

    expect(screen.getByRole('button', { name: /^Mitosis/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Prophase/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show subtopics of Mitosis' }));
    expect(screen.getByRole('button', { name: /^Prophase/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide subtopics of Mitosis' })).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByRole('button', { name: /^Mitosis/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    await userEvent.click(screen.getByRole('button', { name: /^Prophase/ }));
    expect(on_open_topic).toHaveBeenCalledWith(TOPICS[3]);
  });

  it('opens the folders above the chosen topic', () => {
    render(<TopicOutline topics={TOPICS} suggested_ids={new Set()} selected_topic_id="t4" on_open_topic={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^Prophase/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TopicMap', () => {
  it('offers one detail level per level of topics', () => {
    expect(build_detail_options(2)).toEqual([
      { value: 1, label: '1' },
      { value: 2, label: '2' },
    ]);
  });

  it('shows two levels at first, more on request, and switches to the outline', async () => {
    const on_open_topic = vi.fn();
    render(<TopicMap skill={SKILL} topics={TOPICS} suggestions={SUGGESTIONS} selected_topic_id="t1" on_open_topic={on_open_topic} />);

    const map_list = screen.getByRole('list', { name: 'Topics in Biology' });
    expect(within(map_list).getAllByRole('button')).toHaveLength(3);
    expect(within(map_list).getByRole('button', { name: /^Mitosis.*1 more subtopics/ })).toBeInTheDocument();
    expect(within(map_list).getByRole('button', { name: /^Cells/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('radio', { name: '3' }));
    expect(within(map_list).getAllByRole('button')).toHaveLength(4);
    await userEvent.click(within(map_list).getByRole('button', { name: /^Prophase/ }));
    expect(on_open_topic).toHaveBeenCalledWith(TOPICS[3]);

    await userEvent.click(screen.getByRole('radio', { name: 'Outline' }));
    expect(screen.queryByRole('list', { name: 'Topics in Biology' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '3' })).not.toBeInTheDocument();
  });
});

describe('StudyNextPanel', () => {
  it('lists suggestions with reasons and opens a quiz', async () => {
    const on_open_topic = vi.fn();
    render(<StudyNextPanel suggestions={SUGGESTIONS} has_topics on_open_topic={on_open_topic} />);

    expect(screen.getByText('Your recent score is 30%.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quiz me on Cells' }));
    expect(on_open_topic).toHaveBeenCalledWith({ id: 't1', topic: 'Cells' });
  });

  it('celebrates when every topic is strong, and shows nothing without topics', () => {
    const { rerender } = render(<StudyNextPanel suggestions={[]} has_topics on_open_topic={vi.fn()} />);
    expect(screen.getByText(/Every topic is strong/)).toBeInTheDocument();

    rerender(<StudyNextPanel suggestions={[]} has_topics={false} on_open_topic={vi.fn()} />);
    expect(screen.queryByText(/Every topic is strong/)).not.toBeInTheDocument();
  });
});

describe('TopicManager', () => {
  // Renders the manager with spies for each change callback.
  function render_manager(skill = SKILL) {
    const callbacks = { on_topic_map_changed: vi.fn(), on_topic_added: vi.fn() };
    render(<TopicManager skill={skill} topics={TOPICS} {...callbacks} />);
    return callbacks;
  }

  it('asks the AI for topics', async () => {
    topic_service.generate_topics.mockResolvedValue({ topics: TOPICS, suggestions: [] });
    const { on_topic_map_changed } = render_manager();

    await userEvent.click(screen.getByRole('button', { name: 'Find topics in my resources' }));

    expect(topic_service.generate_topics).toHaveBeenCalledWith('s1');
    expect(on_topic_map_changed).toHaveBeenCalledWith({ topics: TOPICS, suggestions: [] });
  });

  it('suggests a course outline for a skill without resources, and shows errors', async () => {
    topic_service.generate_topics.mockRejectedValue(new Error('Practice mode can only work from your resources'));
    render_manager({ ...SKILL, resource_count: 0 });

    expect(screen.getByText(/No resources yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Suggest topics for Biology' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Practice mode');
  });

  it('adds a topic at any level, showing the levels in the list', async () => {
    topic_service.add_topic.mockResolvedValueOnce({ id: 't5', topic: 'Anaphase' });
    const { on_topic_added } = render_manager();

    await userEvent.click(screen.getByText('Add a topic'));
    expect(screen.getByRole('option', { name: '— — Prophase' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New topic'), 'Anaphase');
    await userEvent.selectOptions(screen.getByLabelText('Part of'), 't2');
    await userEvent.click(screen.getByRole('button', { name: 'Add topic' }));

    expect(topic_service.add_topic).toHaveBeenCalledWith('s1', { topic: 'Anaphase', parent_topic_id: 't2' });
    expect(on_topic_added).toHaveBeenCalledWith({ id: 't5', topic: 'Anaphase' });

    const duplicate_error = Object.assign(new Error('This skill already has that topic'), {
      field_errors: { topic: 'This skill already has that topic' },
    });
    topic_service.add_topic.mockRejectedValueOnce(duplicate_error);
    await userEvent.type(screen.getByLabelText('New topic'), 'Cells');
    await userEvent.click(screen.getByRole('button', { name: 'Add topic' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This skill already has that topic');
  });
});
