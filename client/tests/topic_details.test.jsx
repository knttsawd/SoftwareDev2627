import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { use_api_data } from '../src/hooks/use_api_data.js';
import { use_media_query } from '../src/hooks/use_media_query.js';
import { render_in_router } from './helpers/render_helpers.jsx';
import { build_topic_chain, RESOURCES, SKILL, SUGGESTIONS, TOPICS } from './helpers/topic_fixtures.js';

vi.mock('../src/services/topic_service.js', () => ({
  fetch_topic_map: vi.fn(),
  add_topic: vi.fn(),
  generate_topics: vi.fn(),
  generate_subtopics: vi.fn(),
  update_topic: vi.fn(),
  delete_topic: vi.fn(),
}));
vi.mock('../src/services/learning_service.js', () => ({
  fetch_glossary: vi.fn().mockResolvedValue([]),
  explain_another_way: vi.fn(),
}));
vi.mock('../src/services/resource_service.js', () => ({
  move_resource_to_topic: vi.fn(),
  add_resource_text: vi.fn(),
  add_resource_link: vi.fn(),
  upload_resource_file: vi.fn(),
}));

const topic_service = await import('../src/services/topic_service.js');
const resource_service = await import('../src/services/resource_service.js');
const tree = await import('../src/utils/topic_tree.js');
const { describe_branch_levels } = await import('../src/components/topic_map/TopicDetails.jsx');
const { build_topic_updates } = await import('../src/components/topic_map/TopicEditor.jsx');
const { default: TopicDialog } = await import('../src/components/topic_map/TopicDialog.jsx');
const { default: TopicPanel } = await import('../src/components/topic_map/TopicPanel.jsx');
const { default: TopicMapSection } = await import('../src/components/topic_map/TopicMapSection.jsx');

beforeEach(() => {
  vi.clearAllMocks();
});

// A stand-in window whose matchMedia always answers `matches`, with change listeners.
function create_media_window(matches) {
  const listeners = new Set();
  const media_list = {
    matches,
    addEventListener: (event_name, listener) => listeners.add(listener),
    removeEventListener: (event_name, listener) => listeners.delete(listener),
  };
  return { matchMedia: () => media_list, media_list, listeners };
}

describe('topic tree helpers', () => {
  it('builds the tree with depths, treating missing parents and loops as main topics', () => {
    const topic_tree = tree.build_topic_tree([
      ...TOPICS,
      { id: 'orphan', topic: 'Orphan', parent_node_id: 'gone' },
      { id: 'loop_a', topic: 'A', parent_node_id: 'loop_b' },
      { id: 'loop_b', topic: 'B', parent_node_id: 'loop_a' },
    ]);

    expect(topic_tree.map((tree_node) => tree_node.topic.id)).toEqual(['t1', 't3', 'orphan', 'loop_a']);
    expect(topic_tree[0].children[0].children[0]).toMatchObject({ depth: 3, children: [] });
    expect(topic_tree[3].children.map((tree_node) => tree_node.topic.id)).toEqual(['loop_b']);
    expect(tree.flatten_topic_tree(topic_tree)).toHaveLength(7);
    expect(tree.get_tree_depth(topic_tree)).toBe(3);
    expect(tree.get_tree_depth([])).toBe(0);
  });

  it('finds children, paths, branches and where a topic can move', () => {
    expect(tree.list_child_topics(TOPICS, 't1').map((topic) => topic.id)).toEqual(['t2']);
    expect(tree.list_topic_path(TOPICS, 't4').map((topic) => topic.topic)).toEqual(['Cells', 'Mitosis', 'Prophase']);
    expect(tree.list_topic_path([{ id: 'a', parent_node_id: 'b' }, { id: 'b', parent_node_id: 'a' }], 'a')).toHaveLength(2);
    expect([...tree.list_branch_topic_ids(TOPICS, 't1')]).toEqual(['t1', 't2', 't4']);
    expect(tree.list_possible_parents(TOPICS, 't2').map((topic) => topic.id)).toEqual(['t1', 't3']);
  });

  it('counts mastery levels across the skill and under a topic', () => {
    expect(tree.count_mastery_levels(TOPICS)).toEqual({ strong: 1, developing: 0, weak: 1, untested: 2 });
    expect(tree.count_branch_levels(TOPICS, 't1')).toEqual({ strong: 0, developing: 0, weak: 0, untested: 2 });
    expect(describe_branch_levels(tree.count_branch_levels(TOPICS, 't1'))).toBe('2 not tested');
    expect(describe_branch_levels(tree.count_branch_levels(TOPICS, 't3'))).toBe('');
  });

  it("lists a topic's resources, naming the subtopic for ones filed lower down", () => {
    expect(tree.list_topic_resources(TOPICS, RESOURCES, 't1')).toEqual([
      { ...RESOURCES[0], in_subtopic: null },
      { ...RESOURCES[1], in_subtopic: 'Mitosis' },
    ]);
    expect(tree.find_topic_name(TOPICS, 't3')).toBe('Genetics');
    expect(tree.find_topic_name(TOPICS, null)).toBeNull();
    expect(tree.format_indented_name({ depth: 3, topic: { topic: 'Prophase' } })).toBe('— — Prophase');
  });
});

describe('use_media_query', () => {
  it('follows the media query, and is false without matchMedia', () => {
    const media_window = create_media_window(false);
    const { result } = renderHook(() => use_media_query('(min-width: 1px)', media_window));

    expect(result.current).toBe(false);
    act(() => {
      media_window.media_list.matches = true;
      media_window.listeners.forEach((listener) => listener());
    });
    expect(result.current).toBe(true);
    expect(renderHook(() => use_media_query('(min-width: 1px)', {})).result.current).toBe(false);
  });
});

describe('build_topic_updates', () => {
  it('sends only what changed', () => {
    expect(build_topic_updates(TOPICS[1], { topic: 'Mitosis', parent_topic_id: 't1' })).toEqual({});
    expect(build_topic_updates(TOPICS[1], { topic: 'Cell division', parent_topic_id: '' })).toEqual({
      topic: 'Cell division',
      parent_topic_id: null,
    });
  });
});

// Renders the popup for a topic with spies for every callback.
function render_dialog(topic = TOPICS[0], topics = TOPICS) {
  const callbacks = {
    on_close: vi.fn(),
    on_select_topic: vi.fn(),
    on_resource_added: vi.fn(),
    on_resource_updated: vi.fn(),
    on_topics_changed: vi.fn(),
    on_topic_map_changed: vi.fn(),
    on_topic_deleted: vi.fn(),
  };
  render_in_router(<TopicDialog skill={SKILL} topic={topic} topics={topics} resources={RESOURCES} {...callbacks} />);
  return callbacks;
}

describe('TopicDialog and TopicDetails', () => {
  it('shows where the topic sits, how it and its subtopics are doing, and ways to study it', async () => {
    const { on_select_topic } = render_dialog(TOPICS[1]);
    const dialog = screen.getByRole('dialog', { name: 'Mitosis' });

    const topic_path = within(dialog).getByRole('navigation', { name: 'Topic path' });
    expect(topic_path).toHaveTextContent('Biology');
    expect(within(topic_path).getByText('Mitosis')).toHaveAttribute('aria-current', 'location');
    await userEvent.click(within(topic_path).getByRole('button', { name: 'Cells' }));
    expect(on_select_topic).toHaveBeenCalledWith('t1');

    expect(dialog).toHaveTextContent('Under this topic: 1 not tested.');
    expect(within(dialog).getByRole('link', { name: 'Quiz me on this topic' })).toHaveAttribute('href', '/dashboard/quiz?skill=s1&topic=t2');
    expect(within(dialog).getByRole('link', { name: 'Learn it step by step' })).toHaveAttribute(
      'href',
      '/dashboard/learn?skill=s1&tab=lessons&topic=t2',
    );
    expect(within(dialog).getByRole('link', { name: 'Practise it' })).toHaveAttribute('href', '/dashboard/learn?skill=s1&tab=practice&topic=t2');
    expect(await within(dialog).findByText('No key terms for this topic yet.', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Teach it to Pip' })).toHaveAttribute('href', '/dashboard/teach?skill=s1&topic=t2');
    // Outside a dashboard page there is no assistant to ask.
    expect(within(dialog).queryByRole('button', { name: 'Ask the assistant' })).not.toBeInTheDocument();
  });

  it('lists subtopics, adds one, and asks the AI to break the topic down', async () => {
    topic_service.add_topic.mockResolvedValue({ id: 't9', topic: 'Anaphase' });
    topic_service.generate_subtopics.mockResolvedValue({ topics: TOPICS, suggestions: [] });
    const { on_select_topic, on_topics_changed, on_topic_map_changed } = render_dialog(TOPICS[1]);

    await userEvent.click(screen.getByRole('button', { name: /^Prophase/ }));
    expect(on_select_topic).toHaveBeenCalledWith('t4');

    await userEvent.type(screen.getByLabelText('Add a subtopic'), 'Anaphase');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(topic_service.add_topic).toHaveBeenCalledWith('s1', { topic: 'Anaphase', parent_topic_id: 't2' });
    expect(on_topics_changed).toHaveBeenCalled();
    expect(screen.getByLabelText('Add a subtopic')).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Break into subtopics with AI' }));
    expect(topic_service.generate_subtopics).toHaveBeenCalledWith('t2');
    expect(on_topic_map_changed).toHaveBeenCalledWith({ topics: TOPICS, suggestions: [] });
  });

  it('shows errors when adding a subtopic fails', async () => {
    topic_service.add_topic.mockRejectedValue(Object.assign(new Error('Topics can be at most 6 levels deep'), { field_errors: {} }));
    render_dialog(TOPICS[1]);

    await userEvent.type(screen.getByLabelText('Add a subtopic'), 'Deep');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('levels deep');
  });

  it('stops adding levels at the deepest one', () => {
    const chain = build_topic_chain(6);
    render_dialog(chain.at(-1), chain);

    expect(screen.getByText(/This is the deepest level \(6\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a subtopic')).not.toBeInTheDocument();
  });

  it("shows the topic's resources, with subtopics' labelled, and moves another one in", async () => {
    resource_service.move_resource_to_topic.mockResolvedValue({ ...RESOURCES[2], topic_id: 't1' });
    const { on_resource_updated } = render_dialog();

    const resources_section = screen.getByRole('heading', { name: 'Resources in this topic' }).closest('section');
    expect(within(resources_section).getAllByRole('listitem')[1]).toHaveTextContent('YouTube · in Mitosis');
    expect(within(resources_section).getByRole('link', { name: 'Read Cell notes with a guide' })).toHaveAttribute(
      'href',
      expect.stringContaining('/dashboard/learn?skill=s1&tab=reading&read='),
    );
    expect(within(resources_section).getByRole('link', { name: 'Quiz me on Cell notes' })).toHaveAttribute(
      'href',
      '/dashboard/quiz?skill=s1&resource=r1',
    );

    await userEvent.selectOptions(screen.getByLabelText('A resource you already added'), 'Textbook');
    await userEvent.click(screen.getByRole('button', { name: 'Move here' }));
    expect(resource_service.move_resource_to_topic).toHaveBeenCalledWith('r3', 't1');
    expect(on_resource_updated).toHaveBeenCalledWith({ ...RESOURCES[2], topic_id: 't1' });
    expect(await screen.findByText('Moved "Textbook" into Cells.')).toBeInTheDocument();
  });

  it('takes a resource out of the topic, and shows errors', async () => {
    resource_service.move_resource_to_topic.mockRejectedValueOnce(new Error('Server down'));
    render_dialog();

    await userEvent.click(screen.getByRole('button', { name: 'Take out Cell notes' }));

    expect(resource_service.move_resource_to_topic).toHaveBeenCalledWith('r1', null);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
  });

  it('adds a new resource straight into the topic', async () => {
    const new_resource = { id: 'r4', title: 'Typed', resource_type: 'note', topic_id: 't3' };
    resource_service.add_resource_text.mockResolvedValue(new_resource);
    const { on_resource_added } = render_dialog(TOPICS[2]);

    expect(screen.getByText(/None yet. Quizzes on this topic/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add a new resource' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Type or paste notes' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Typed');
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'Some notes');
    await userEvent.click(screen.getByRole('button', { name: 'Add resource' }));

    expect(resource_service.add_resource_text).toHaveBeenCalledWith('s1', { title: 'Typed', text: 'Some notes', topic_id: 't3' });
    expect(on_resource_added).toHaveBeenCalledWith(new_resource);
  });

  it('renames and moves a topic, offering only places outside its own branch', async () => {
    topic_service.update_topic.mockResolvedValue({});
    const { on_topics_changed } = render_dialog();

    await userEvent.click(screen.getByText('Rename, move or remove'));
    const parent_select = screen.getByLabelText('Part of');
    expect(within(parent_select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Nothing (main topic)', 'Genetics']);
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Cell biology');
    await userEvent.selectOptions(parent_select, 't3');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(topic_service.update_topic).toHaveBeenCalledWith('t1', { topic: 'Cell biology', parent_topic_id: 't3' });
    expect(on_topics_changed).toHaveBeenCalled();
  });

  it('removes a topic after confirmation, and shows save errors', async () => {
    topic_service.delete_topic.mockResolvedValue(null);
    topic_service.update_topic.mockRejectedValue(Object.assign(new Error('Please fix'), { field_errors: { topic: 'Taken' } }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { on_topic_deleted } = render_dialog(TOPICS[1]);

    await userEvent.click(screen.getByText('Rename, move or remove'));
    await userEvent.type(screen.getByLabelText('Name'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Taken')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove topic' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('subtopics and resources move up a level'));
    expect(topic_service.delete_topic).toHaveBeenCalledWith('t2');
    expect(on_topic_deleted).toHaveBeenCalledWith(TOPICS[1]);
  });
});

describe('TopicPanel', () => {
  it('explains what choosing a topic does', () => {
    render_in_router(<TopicPanel topic={null} on_close={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'Topic details' })).toHaveTextContent('Choose a topic');
  });

  it('shows the chosen topic, with its sections a level below its heading, and a close button', async () => {
    const on_close = vi.fn();
    render_in_router(
      <TopicPanel skill={SKILL} topic={TOPICS[2]} topics={TOPICS} resources={RESOURCES} on_close={on_close} on_select_topic={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Genetics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Subtopics' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close topic details' }));
    expect(on_close).toHaveBeenCalled();
  });
});

// TopicMapSection with its parent's part played here: SkillMapPage loads the topic map.
function TopicMapSectionHarness({ media_window, on_resources_moved = vi.fn() }) {
  const topic_map_state = use_api_data(() => topic_service.fetch_topic_map(SKILL.id), []);
  return (
    <TopicMapSection
      skill={SKILL}
      topic_map_state={topic_map_state}
      resources={RESOURCES}
      on_resource_added={vi.fn()}
      on_resource_updated={vi.fn()}
      on_resources_moved={on_resources_moved}
      media_window={media_window}
    />
  );
}

describe('TopicMapSection', () => {
  beforeEach(() => {
    topic_service.fetch_topic_map.mockResolvedValue({ topics: TOPICS, suggestions: SUGGESTIONS });
  });

  it('opens the quiz page from a suggestion', async () => {
    const { router } = render_in_router(<TopicMapSectionHarness />, { initial_path: '/dashboard/skill-map' });

    await userEvent.click(await screen.findByRole('button', { name: 'Quiz me on Cells' }));

    expect(router.state.location.pathname).toBe('/dashboard/quiz');
    expect(router.state.location.search).toBe('?skill=s1&topic=t1');
  });

  it('shows an overview, and opens a topic in a popup on narrower screens', async () => {
    render_in_router(<TopicMapSectionHarness />);

    expect(await screen.findByText('1 of 4 topics strong')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Genetics: Strong/ })[0]);
    expect(screen.getByRole('dialog', { name: 'Genetics' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the topic beside the map on wide screens, and moves to the parent after a removal', async () => {
    topic_service.delete_topic.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const on_resources_moved = vi.fn();
    render_in_router(<TopicMapSectionHarness media_window={create_media_window(true)} on_resources_moved={on_resources_moved} />);

    expect(await screen.findByRole('region', { name: 'Topic details' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Mitosis/ })[0]);
    const panel = screen.getByRole('region', { name: 'Mitosis' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByText('Rename, move or remove'));
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove topic' }));

    await waitFor(() => expect(topic_service.fetch_topic_map).toHaveBeenCalledTimes(2));
    expect(on_resources_moved).toHaveBeenCalled();
    expect(await screen.findByRole('region', { name: 'Cells' })).toBeInTheDocument();
  });

  it('centres the map on a topic with subtopics, and back on the whole skill', async () => {
    render_in_router(<TopicMapSectionHarness media_window={create_media_window(true)} />);

    await userEvent.click((await screen.findAllByRole('button', { name: /^Cells/ }))[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Centre the map here' }));

    const map_list = screen.getByRole('list', { name: 'Topics in Cells' });
    expect(within(map_list).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Mitosis: Not tested. Open topic',
      'Prophase: Not tested. Open topic',
    ]);
    const focus_path = screen.getByRole('navigation', { name: 'Map centred on' });
    expect(within(focus_path).getByText('Cells')).toHaveAttribute('aria-current', 'location');

    await userEvent.click(within(focus_path).getByRole('button', { name: 'All of Biology' }));
    expect(screen.getByRole('list', { name: 'Topics in Biology' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Genetics/ })[0]);
    expect(screen.queryByRole('button', { name: 'Centre the map here' })).not.toBeInTheDocument();
  });

  it('explains an empty map', async () => {
    topic_service.fetch_topic_map.mockResolvedValue({ topics: [], suggestions: [] });
    render_in_router(<TopicMapSectionHarness />);

    expect(await screen.findByText(/No topics yet/)).toHaveTextContent('Topics nest like folders');
  });

  it('reloads the map after a topic is added', async () => {
    topic_service.add_topic.mockResolvedValue({ id: 't5', topic: 'Meiosis' });
    render_in_router(<TopicMapSectionHarness />);
    await screen.findByRole('button', { name: 'Quiz me on Cells' });

    await userEvent.click(screen.getByText('Add a topic'));
    await userEvent.type(screen.getByLabelText('New topic'), 'Meiosis');
    await userEvent.click(screen.getByRole('button', { name: 'Add topic' }));

    await waitFor(() => expect(topic_service.fetch_topic_map).toHaveBeenCalledTimes(2));
  });
});
