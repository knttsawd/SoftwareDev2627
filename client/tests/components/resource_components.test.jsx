import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { use_api_data } from '../../src/hooks/use_api_data.js';
import { render_in_router } from '../helpers/render_helpers.jsx';

vi.mock('../../src/services/resource_service.js', () => ({
  fetch_resources: vi.fn(),
  upload_resource_file: vi.fn(),
  add_resource_link: vi.fn(),
  add_resource_text: vi.fn(),
  delete_resource: vi.fn(),
}));

const resource_service = await import('../../src/services/resource_service.js');
const { check_selected_file, default: AddResourceDialog, submit_resource } = await import(
  '../../src/components/AddResourceDialog.jsx'
);
const { describe_added_resource, default: ResourcesPanel } = await import('../../src/components/ResourcesPanel.jsx');

const SKILL = { id: 's1', name: 'Biology', resource_count: 1 };
const TOPICS = [{ id: 't1', topic: 'Plants' }];
const RESOURCE = {
  id: 'r1',
  topic_id: null,
  title: 'Chapter 1',
  resource_type: 'pdf',
  character_count: 1200,
  created_at: '2026-10-24T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('check_selected_file', () => {
  it('requires a file under the size limit', () => {
    expect(check_selected_file(null)).toBe('Choose a file to upload');
    expect(check_selected_file({ size: 26 * 1024 * 1024 })).toBe('That file is larger than 25 MB');
    expect(check_selected_file({ size: 1000 })).toBeNull();
  });
});

describe('submit_resource', () => {
  it('uses the endpoint for each mode', async () => {
    const file = new File(['x'], 'a.pdf');
    const form_values = { file, url: 'https://example.com', title: 'T', text: 'body', topic_id: 't1' };

    await submit_resource('s1', 'file', form_values);
    await submit_resource('s1', 'link', form_values);
    await submit_resource('s1', 'text', { ...form_values, topic_id: '' });

    expect(resource_service.upload_resource_file).toHaveBeenCalledWith('s1', file, 'T', 't1');
    expect(resource_service.add_resource_link).toHaveBeenCalledWith('s1', {
      url: 'https://example.com',
      title: 'T',
      topic_id: 't1',
    });
    expect(resource_service.add_resource_text).toHaveBeenCalledWith('s1', { title: 'T', text: 'body', topic_id: undefined });
  });
});

describe('AddResourceDialog', () => {
  // Renders the open dialog and returns its on_added spy.
  function render_open_dialog(topics = []) {
    const on_added = vi.fn();
    render(<AddResourceDialog skill={SKILL} topics={topics} is_open on_close={vi.fn()} on_added={on_added} />);
    return on_added;
  }

  it('uploads a chosen file', async () => {
    resource_service.upload_resource_file.mockResolvedValue(RESOURCE);
    const on_added = render_open_dialog();
    const file = new File(['pdf'], 'chapter.pdf', { type: 'application/pdf' });

    await userEvent.upload(screen.getByLabelText('File'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Add resource' }));

    expect(resource_service.upload_resource_file).toHaveBeenCalledWith('s1', file, '', undefined);
    expect(on_added).toHaveBeenCalledWith(RESOURCE);
  });

  it('files a new resource under a chosen topic', async () => {
    resource_service.add_resource_link.mockResolvedValue(RESOURCE);
    render_open_dialog(TOPICS);

    await userEvent.click(screen.getByRole('radio', { name: 'Add a link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Link' }), 'https://example.com/plants');
    await userEvent.selectOptions(screen.getByLabelText('Topic (optional)'), 'Plants');
    await userEvent.click(screen.getByRole('button', { name: 'Add resource' }));

    expect(resource_service.add_resource_link).toHaveBeenCalledWith('s1', {
      url: 'https://example.com/plants',
      title: '',
      topic_id: 't1',
    });
  });

  it('hides the topic choice when the skill has no topics', () => {
    render_open_dialog();

    expect(screen.queryByLabelText('Topic (optional)')).not.toBeInTheDocument();
  });

  it('asks for a file before uploading', async () => {
    render_open_dialog();

    await userEvent.click(screen.getByRole('button', { name: 'Add resource' }));

    expect(screen.getByText('Choose a file to upload')).toBeInTheDocument();
    expect(resource_service.upload_resource_file).not.toHaveBeenCalled();
  });

  it('adds a link', async () => {
    resource_service.add_resource_link.mockResolvedValue(RESOURCE);
    render_open_dialog();

    await userEvent.click(screen.getByRole('radio', { name: 'Add a link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Link' }), 'https://example.com/plants');
    await userEvent.click(screen.getByRole('button', { name: 'Add resource' }));

    expect(resource_service.add_resource_link).toHaveBeenCalledWith('s1', {
      url: 'https://example.com/plants',
      title: '',
      topic_id: undefined,
    });
  });

  it('adds typed notes and shows server errors', async () => {
    const save_error = new Error('Please fix the highlighted fields');
    save_error.field_errors = { title: 'Title is required' };
    resource_service.add_resource_text.mockRejectedValue(save_error);
    render_open_dialog();

    await userEvent.click(screen.getByRole('radio', { name: 'Type or paste notes' }));
    await userEvent.type(screen.getByLabelText('Notes'), 'My notes');
    await userEvent.click(screen.getByRole('button', { name: 'Add resource' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please fix the highlighted fields');
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });
});

describe('describe_added_resource', () => {
  it('confirms the title and mentions truncation', () => {
    expect(describe_added_resource({ title: 'Notes', is_truncated: false })).toBe('Added "Notes".');
    expect(describe_added_resource({ title: 'Book', is_truncated: true })).toMatch('Only the first part was kept');
  });
});

// ResourcesPanel with its parent's part played here: it loads the list and counts changes.
function ResourcesPanelHarness({ on_count_change }) {
  const resources_state = use_api_data(() => resource_service.fetch_resources(SKILL.id), []);
  return (
    <ResourcesPanel
      skill={SKILL}
      resources_state={resources_state}
      topics={TOPICS}
      on_resource_added={(resource) => {
        resources_state.set_data((current_resources) => [...current_resources, resource]);
        on_count_change(1);
      }}
      on_resource_deleted={(resource_id) => {
        resources_state.set_data((current_resources) => current_resources.filter((item) => item.id !== resource_id));
        on_count_change(-1);
      }}
    />
  );
}

function render_panel(on_count_change = vi.fn()) {
  render_in_router(<ResourcesPanelHarness on_count_change={on_count_change} />);
  return on_count_change;
}

describe('ResourcesPanel', () => {
  it('lists resources with their type and topic in words, and a quiz link for each', async () => {
    resource_service.fetch_resources.mockResolvedValue([RESOURCE, { ...RESOURCE, id: 'r2', title: 'Leaves', topic_id: 't1' }]);
    render_panel();

    const [first_item, second_item] = await screen.findAllByRole('listitem');
    expect(within(first_item).getByText('Chapter 1')).toBeInTheDocument();
    expect(first_item).toHaveTextContent('PDF · 1.2K characters');
    expect(first_item).not.toHaveTextContent('Topic:');
    expect(second_item).toHaveTextContent('Topic: Plants');
    expect(within(first_item).getByRole('link', { name: 'Read Chapter 1 with a guide' })).toHaveAttribute(
      'href',
      expect.stringContaining('/dashboard/learn?skill=s1&tab=reading&read='),
    );
    expect(within(first_item).getByRole('link', { name: 'Quiz me on Chapter 1' })).toHaveAttribute(
      'href',
      '/dashboard/quiz?skill=s1&resource=r1',
    );
  });

  it('explains the empty state', async () => {
    resource_service.fetch_resources.mockResolvedValue([]);
    render_panel();

    expect(await screen.findByText(/No resources yet/)).toHaveTextContent('general knowledge of Biology');
  });

  it('adds a resource through the dialog and reports the new count', async () => {
    resource_service.fetch_resources.mockResolvedValue([]);
    resource_service.add_resource_text.mockResolvedValue({ ...RESOURCE, id: 'r2', title: 'Typed', resource_type: 'note' });
    const on_count_change = render_panel();
    await screen.findByText(/No resources yet/);

    await userEvent.click(screen.getByRole('button', { name: 'Add resource' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Type or paste notes' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Typed');
    await userEvent.type(screen.getByLabelText('Notes'), 'Some notes');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add resource' }));

    expect(await screen.findByText('Added "Typed".')).toBeInTheDocument();
    expect(on_count_change).toHaveBeenCalledWith(1);
    expect(screen.getByRole('listitem')).toHaveTextContent('Typed');
  });

  it('deletes a resource after confirmation', async () => {
    resource_service.fetch_resources.mockResolvedValue([RESOURCE]);
    resource_service.delete_resource.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const on_count_change = render_panel();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Chapter 1' }));

    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
    expect(resource_service.delete_resource).toHaveBeenCalledWith('r1');
    expect(on_count_change).toHaveBeenCalledWith(-1);
  });

  it('keeps the resource when deletion is cancelled', async () => {
    resource_service.fetch_resources.mockResolvedValue([RESOURCE]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render_panel();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Chapter 1' }));

    expect(resource_service.delete_resource).not.toHaveBeenCalled();
  });

  it('shows an error when deleting fails', async () => {
    resource_service.fetch_resources.mockResolvedValue([RESOURCE]);
    resource_service.delete_resource.mockRejectedValue(new Error('Server down'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render_panel();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Chapter 1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
  });
});
