import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/study_material_service.js', () => ({ fetch_ai_status: vi.fn() }));
vi.mock('../../src/services/skill_service.js', () => ({ create_skill: vi.fn() }));

const { fetch_ai_status } = await import('../../src/services/study_material_service.js');
const { create_skill } = await import('../../src/services/skill_service.js');
const { default: AiModeNotice } = await import('../../src/components/AiModeNotice.jsx');
const { default: CreateSkillDialog } = await import('../../src/components/CreateSkillDialog.jsx');
const { default: Dialog } = await import('../../src/components/Dialog.jsx');
const { default: MarkdownContent } = await import('../../src/components/MarkdownContent.jsx');
const { default: SkillPicker } = await import('../../src/components/SkillPicker.jsx');
const { default: TopicGenerator } = await import('../../src/components/TopicGenerator.jsx');

const SKILLS = [
  { id: 's1', name: 'Biology', color: '#15803D' },
  { id: 's2', name: 'Spanish', color: '#B91C1C' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dialog', () => {
  it('opens as a labelled dialog and shows its content only while open', () => {
    const { rerender } = render(
      <Dialog title="New skill" is_open={false} on_close={vi.fn()}>
        <p>form</p>
      </Dialog>,
    );
    expect(screen.queryByText('form')).not.toBeInTheDocument();

    rerender(
      <Dialog title="New skill" is_open on_close={vi.fn()}>
        <p>form</p>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'New skill' })).toHaveAttribute('open');
    expect(screen.getByText('form')).toBeInTheDocument();
  });

  it('calls on_close from the close button and when the browser closes it', async () => {
    const on_close = vi.fn();
    const { rerender } = render(
      <Dialog title="New skill" is_open on_close={on_close}>
        <p>form</p>
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(on_close).toHaveBeenCalledTimes(1);

    rerender(
      <Dialog title="New skill" is_open={false} on_close={on_close}>
        <p>form</p>
      </Dialog>,
    );
    expect(on_close).toHaveBeenCalledTimes(2);
  });
});

describe('MarkdownContent', () => {
  it('renders Markdown with headings shifted down and never renders raw HTML', () => {
    render(<MarkdownContent markdown_text={'# Cells\n\n- Nucleus\n\n<script>alert(1)</script>'} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Cells' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Nucleus');
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('AiModeNotice', () => {
  it('explains practice mode when the mock AI is on', async () => {
    fetch_ai_status.mockResolvedValue({ ai_provider: 'mock', transcription_provider: 'openai' });
    render(<AiModeNotice />);

    expect(await screen.findByRole('complementary', { name: 'Practice mode' })).toHaveTextContent('without a real AI model');
    expect(screen.queryByText(/saved without being transcribed/)).not.toBeInTheDocument();
  });

  it('shows nothing when real providers are on', async () => {
    fetch_ai_status.mockResolvedValue({ ai_provider: 'anthropic', transcription_provider: 'openai' });
    render(<AiModeNotice />);

    await waitFor(() => expect(fetch_ai_status).toHaveBeenCalled());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

describe('SkillPicker', () => {
  it('lists skills in a labelled dropdown and reports the choice', async () => {
    const on_select = vi.fn();
    render(<SkillPicker skills={SKILLS} selected_skill_id="s1" on_select={on_select} on_add_click={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Skill'), 'Spanish');

    expect(screen.getByLabelText('Skill')).toHaveValue('s1');
    expect(on_select).toHaveBeenCalledWith('s2');
  });

  it('shows only the add button when there are no skills', async () => {
    const on_add_click = vi.fn();
    render(<SkillPicker skills={[]} selected_skill_id={undefined} on_select={vi.fn()} on_add_click={on_add_click} />);

    await userEvent.click(screen.getByRole('button', { name: 'New skill' }));

    expect(screen.queryByLabelText('Skill')).not.toBeInTheDocument();
    expect(on_add_click).toHaveBeenCalled();
  });
});

describe('CreateSkillDialog', () => {
  it('creates a skill with the chosen name and default color', async () => {
    create_skill.mockResolvedValue({ id: 's3', name: 'Guitar' });
    const on_created = vi.fn();
    render(<CreateSkillDialog is_open on_close={vi.fn()} on_created={on_created} />);

    await userEvent.type(screen.getByLabelText('Skill name'), 'Guitar');
    await userEvent.click(screen.getByRole('button', { name: 'Add skill' }));

    expect(create_skill).toHaveBeenCalledWith({ name: 'Guitar', color: '#4F46E5' });
    expect(on_created).toHaveBeenCalledWith({ id: 's3', name: 'Guitar' });
  });

  it('shows a duplicate-name error under the field', async () => {
    const save_error = new Error('You already have a skill with that name');
    save_error.field_errors = { name: 'You already have a skill with that name' };
    create_skill.mockRejectedValue(save_error);
    render(<CreateSkillDialog is_open on_close={vi.fn()} on_created={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Skill name'), 'Biology');
    await userEvent.click(screen.getByRole('button', { name: 'Add skill' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a skill with that name');
    expect(screen.getByLabelText('Skill name')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('TopicGenerator', () => {
  it('sends the topic and clears it after success', async () => {
    const on_generate = vi.fn().mockResolvedValue(undefined);
    render(
      <TopicGenerator field_id="t" button_label="Make notes" busy_label="Writing…" has_resources on_generate={on_generate} />,
    );

    await userEvent.type(screen.getByLabelText('Topic'), 'Cells');
    await userEvent.click(screen.getByRole('button', { name: 'Make notes' }));

    expect(on_generate).toHaveBeenCalledWith('Cells');
    expect(screen.getByLabelText('Topic')).toHaveValue('');
  });

  it('keeps the topic and shows the error when generating fails', async () => {
    const on_generate = vi.fn().mockRejectedValue(new Error('The AI is busy right now.'));
    render(
      <TopicGenerator field_id="t" button_label="Make notes" busy_label="Writing…" has_resources on_generate={on_generate} />,
    );

    await userEvent.type(screen.getByLabelText('Topic'), 'Cells');
    await userEvent.click(screen.getByRole('button', { name: 'Make notes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now.');
    expect(screen.getByLabelText('Topic')).toHaveValue('Cells');
  });

  it('still works without resources, explaining that the AI will use general knowledge', () => {
    render(
      <TopicGenerator
        field_id="t"
        button_label="Make notes"
        busy_label="Writing…"
        has_resources={false}
        on_generate={vi.fn()}
        extra_fields={<span>extra</span>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Make notes' })).toBeEnabled();
    expect(screen.getByText('No resources yet, so the AI will use its general knowledge.')).toBeInTheDocument();
    expect(screen.getByText('extra')).toBeInTheDocument();
  });
});
