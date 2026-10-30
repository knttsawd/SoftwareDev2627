import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render_in_router } from '../helpers/render_helpers.jsx';

vi.mock('../../src/services/study_material_service.js', () => ({
  fetch_notes: vi.fn(),
  generate_notes: vi.fn(),
  delete_note: vi.fn(),
  fetch_quizzes: vi.fn(),
  generate_quiz: vi.fn(),
  fetch_quiz: vi.fn(),
  delete_quiz: vi.fn(),
}));

const study_material_service = await import('../../src/services/study_material_service.js');
const { default: NotesPanel } = await import('../../src/components/NotesPanel.jsx');
const { default: MarkdownContent } = await import('../../src/components/MarkdownContent.jsx');
const { QuizQuestionList, default: QuizzesPanel } = await import('../../src/components/QuizzesPanel.jsx');

const SKILL = { id: 's1', name: 'Biology', resource_count: 1 };
const NOTE = { id: 'n1', topic: 'Cells', content: '# Cells\n\n- Nucleus', created_at: '2026-10-24T12:00:00.000Z' };
const QUESTIONS = [{ question: 'What holds DNA?', choices: ['Nucleus', 'Wall', 'Ribosome', 'Vacuole'] }];
const QUIZ = { id: 'q1', skill_id: 's1', topic: 'Cells', created_at: '2026-10-24T12:00:00.000Z', questions: QUESTIONS };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MarkdownContent', () => {
  it('styles every element it shows and shifts headings down a level', () => {
    render(
      <MarkdownContent
        markdown_text={'# Title\n\n## Part\n\n### Detail\n\nText with a [link](https://example.com).\n\n- one\n\n1. first\n\n> quoted'}
      />,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Part' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 5, name: 'Detail' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute('target', '_blank');
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByText('quoted').closest('blockquote')).toBeInTheDocument();
  });
});

describe('NotesPanel', () => {
  it('lists saved notes', async () => {
    study_material_service.fetch_notes.mockResolvedValue([NOTE]);
    render(<NotesPanel skill={SKILL} />);

    expect(await screen.findByText('Cells', { selector: 'summary span' })).toBeInTheDocument();
  });

  it('generates notes for a topic and opens them', async () => {
    study_material_service.fetch_notes.mockResolvedValue([]);
    study_material_service.generate_notes.mockResolvedValue(NOTE);
    render(<NotesPanel skill={SKILL} />);

    await userEvent.type(screen.getByLabelText('Topic'), 'Cells');
    await userEvent.click(screen.getByRole('button', { name: 'Make notes' }));

    expect(study_material_service.generate_notes).toHaveBeenCalledWith('s1', 'Cells');
    expect(await screen.findByRole('heading', { level: 3, name: 'Cells' })).toBeVisible();
    expect(screen.getByText('Cells', { selector: 'summary span' }).closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('group', { name: 'Explain it another way' })).toBeInTheDocument();
  });

  it('deletes notes after confirmation', async () => {
    study_material_service.fetch_notes.mockResolvedValue([NOTE]);
    study_material_service.delete_note.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<NotesPanel skill={SKILL} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete these notes', hidden: true }));

    await waitFor(() => expect(screen.queryByRole('group')).not.toBeInTheDocument());
    expect(study_material_service.delete_note).toHaveBeenCalledWith('n1');
  });
});

describe('QuizQuestionList', () => {
  it('numbers questions and letters their choices', () => {
    render(<QuizQuestionList questions={QUESTIONS} />);

    expect(screen.getByText('What holds DNA?')).toBeInTheDocument();
    expect(screen.getByText('A. Nucleus')).toBeInTheDocument();
    expect(screen.getByText('D. Vacuole')).toBeInTheDocument();
  });
});

describe('QuizzesPanel', () => {
  it('generates a quiz with the chosen number of questions and shows it', async () => {
    study_material_service.fetch_quizzes.mockResolvedValue([]);
    study_material_service.generate_quiz.mockResolvedValue(QUIZ);
    render_in_router(<QuizzesPanel skill={SKILL} />);

    await userEvent.type(screen.getByLabelText('Topic'), 'Cells');
    await userEvent.clear(screen.getByLabelText('Questions'));
    await userEvent.type(screen.getByLabelText('Questions'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Make a quiz' }));

    expect(study_material_service.generate_quiz).toHaveBeenCalledWith('s1', { topic: 'Cells', question_count: 8 });
    expect(await screen.findByText('What holds DNA?')).toBeVisible();
    expect(screen.getByText(/1 questions/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take this quiz' })).toHaveAttribute('href', '/dashboard/quiz?quiz=q1');
  });

  it('loads a saved quiz the first time it is opened', async () => {
    study_material_service.fetch_quizzes.mockResolvedValue([{ id: 'q1', topic: 'Cells', question_count: 1, created_at: QUIZ.created_at }]);
    study_material_service.fetch_quiz.mockResolvedValue(QUIZ);
    render_in_router(<QuizzesPanel skill={SKILL} />);

    await userEvent.click(await screen.findByText('Cells', { selector: 'summary span' }));

    expect(await screen.findByText('What holds DNA?')).toBeInTheDocument();
    expect(study_material_service.fetch_quiz).toHaveBeenCalledWith('q1');
  });

  it('deletes a quiz after confirmation', async () => {
    study_material_service.fetch_quizzes.mockResolvedValue([{ id: 'q1', topic: 'Cells', question_count: 1, created_at: QUIZ.created_at }]);
    study_material_service.delete_quiz.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render_in_router(<QuizzesPanel skill={SKILL} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete this quiz', hidden: true }));

    await waitFor(() => expect(screen.queryByRole('group')).not.toBeInTheDocument());
    expect(study_material_service.delete_quiz).toHaveBeenCalledWith('q1');
  });
});
