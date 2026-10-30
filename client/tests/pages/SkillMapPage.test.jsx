import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render_in_router } from '../helpers/render_helpers.jsx';

vi.mock('../../src/services/skill_service.js', () => ({
  fetch_skills: vi.fn(),
  create_skill: vi.fn(),
  delete_skill: vi.fn(),
}));
vi.mock('../../src/services/topic_service.js', () => ({
  fetch_topic_map: vi.fn().mockResolvedValue({ topics: [], suggestions: [] }),
}));
vi.mock('../../src/services/resource_service.js', () => ({
  fetch_resources: vi.fn().mockResolvedValue([]),
  move_resource_to_topic: vi.fn(),
  add_resource_text: vi.fn(),
  delete_resource: vi.fn(),
}));
vi.mock('../../src/services/study_material_service.js', () => ({
  fetch_notes: vi.fn().mockResolvedValue([]),
  fetch_quizzes: vi.fn().mockResolvedValue([]),
  fetch_ai_status: vi.fn().mockResolvedValue({ ai_provider: 'mock', transcription_provider: 'mock' }),
}));

const skill_service = await import('../../src/services/skill_service.js');
const resource_service = await import('../../src/services/resource_service.js');
const topic_service = await import('../../src/services/topic_service.js');
const { find_selected_skill } = await import('../../src/utils/skill_selection.js');
const { change_resource_count, replace_resource, default: SkillMapPage } = await import(
  '../../src/pages/dashboard/SkillMapPage.jsx'
);

const SKILLS = [
  { id: 's1', name: 'Biology', color: '#15803D', resource_count: 0 },
  { id: 's2', name: 'Spanish', color: '#B91C1C', resource_count: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('find_selected_skill', () => {
  it('uses the skill in the address, falling back to the first skill', () => {
    expect(find_selected_skill(SKILLS, 's2').name).toBe('Spanish');
    expect(find_selected_skill(SKILLS, 'missing').name).toBe('Biology');
    expect(find_selected_skill([], null)).toBeNull();
  });
});

describe('change_resource_count', () => {
  it('changes only the named skill', () => {
    expect(change_resource_count(SKILLS, 's2', -1).map((skill) => skill.resource_count)).toEqual([0, 1]);
  });
});

describe('replace_resource', () => {
  it('swaps in the updated copy and keeps the order', () => {
    const resources = [
      { id: 'r1', topic_id: null },
      { id: 'r2', topic_id: null },
    ];

    expect(replace_resource(resources, { id: 'r2', topic_id: 't1' })).toEqual([
      { id: 'r1', topic_id: null },
      { id: 'r2', topic_id: 't1' },
    ]);
  });
});

describe('SkillMapPage', () => {
  it('invites a new student to add their first skill', async () => {
    skill_service.fetch_skills.mockResolvedValue([]);
    render_in_router(<SkillMapPage />, { initial_path: '/dashboard/skill-map' });

    expect(await screen.findByRole('button', { name: 'Add your first skill' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Skill map' })).toBeInTheDocument();
  });

  it('shows the skill from the address with its panels', async () => {
    skill_service.fetch_skills.mockResolvedValue(SKILLS);
    render_in_router(<SkillMapPage />, { initial_path: '/dashboard/skill-map?skill=s2' });

    expect(await screen.findByRole('heading', { level: 2, name: 'Resources' })).toBeInTheDocument();
    expect(screen.getByLabelText('Skill')).toHaveValue('s2');
    expect(screen.getByRole('heading', { level: 2, name: 'Topic map' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Study notes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Quizzes' })).toBeInTheDocument();
  });

  it('switches skills from the dropdown and remembers the choice in the address', async () => {
    skill_service.fetch_skills.mockResolvedValue(SKILLS);
    const { router } = render_in_router(<SkillMapPage />, { initial_path: '/dashboard/skill-map' });

    await userEvent.selectOptions(await screen.findByLabelText('Skill'), 'Spanish');

    expect(router.state.location.search).toBe('?skill=s2');
    expect(screen.getByRole('button', { name: 'Delete Spanish' })).toBeInTheDocument();
  });

  it('adds a skill and selects it', async () => {
    skill_service.fetch_skills.mockResolvedValue([]);
    skill_service.create_skill.mockResolvedValue({ id: 's3', name: 'Guitar', color: '#4F46E5', resource_count: 0 });
    const { router } = render_in_router(<SkillMapPage />, { initial_path: '/dashboard/skill-map' });

    await userEvent.click(await screen.findByRole('button', { name: 'Add your first skill' }));
    await userEvent.type(screen.getByLabelText('Skill name'), 'Guitar');
    await userEvent.click(screen.getByRole('button', { name: 'Add skill' }));

    await waitFor(() => expect(router.state.location.search).toBe('?skill=s3'));
    expect(screen.getByLabelText('Skill')).toHaveValue('s3');
  });

  it('deletes the selected skill after confirmation', async () => {
    skill_service.fetch_skills.mockResolvedValue(SKILLS);
    skill_service.delete_skill.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render_in_router(<SkillMapPage />, { initial_path: '/dashboard/skill-map' });

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Biology' }));

    expect(skill_service.delete_skill).toHaveBeenCalledWith('s1');
    expect(await screen.findByRole('button', { name: 'Delete Spanish' })).toBeInTheDocument();
  });

  it('moves a resource into a topic from the topic popup and shows it in the resource list', async () => {
    const textbook = { id: 'r1', title: 'Textbook', resource_type: 'pdf', topic_id: null, character_count: 10 };
    skill_service.fetch_skills.mockResolvedValue(SKILLS);
    topic_service.fetch_topic_map.mockResolvedValueOnce({
      topics: [{ id: 't1', topic: 'Plants', parent_node_id: null, mastery_score: null, mastery_level: 'untested' }],
      suggestions: [],
    });
    resource_service.fetch_resources.mockResolvedValueOnce([textbook]);
    resource_service.move_resource_to_topic.mockResolvedValue({ ...textbook, topic_id: 't1' });
    render_in_router(<SkillMapPage />, { initial_path: '/dashboard/skill-map' });

    await userEvent.click((await screen.findAllByRole('button', { name: /^Plants: Not tested/ }))[0]);
    const dialog = screen.getByRole('dialog', { name: 'Plants' });
    await userEvent.selectOptions(within(dialog).getByLabelText('A resource you already added'), 'Textbook');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move here' }));

    expect(await within(dialog).findByRole('link', { name: 'Quiz me on Textbook' })).toBeInTheDocument();
    const resources_section = screen.getByRole('heading', { level: 2, name: 'Resources' }).closest('section');
    expect(within(resources_section).getByRole('listitem')).toHaveTextContent('Topic: Plants');
  });

  it('keeps the skill resource count in step as resources are added and deleted', async () => {
    skill_service.fetch_skills.mockResolvedValue(SKILLS);
    topic_service.fetch_topic_map.mockResolvedValueOnce({ topics: [], suggestions: [] });
    resource_service.add_resource_text.mockResolvedValue({ id: 'r9', title: 'Typed', resource_type: 'note', topic_id: null, character_count: 20 });
    resource_service.delete_resource.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render_in_router(<SkillMapPage />, { initial_path: '/dashboard/skill-map' });

    expect(await screen.findByRole('button', { name: 'Suggest topics for Biology' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add resource' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Type or paste notes' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Typed');
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'Some study notes here');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add resource' }));

    expect(await screen.findByRole('button', { name: 'Find topics in my resources' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Typed' }));
    expect(await screen.findByRole('button', { name: 'Suggest topics for Biology' })).toBeInTheDocument();
  });

  it('shows an error when skills cannot load', async () => {
    skill_service.fetch_skills.mockRejectedValue(new Error('Server down'));
    render_in_router(<SkillMapPage />, { initial_path: '/dashboard/skill-map' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
  });
});
