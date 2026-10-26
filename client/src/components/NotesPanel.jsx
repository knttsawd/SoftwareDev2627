import { ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { use_confirm } from '../context/ConfirmContext.jsx';
import { use_api_data } from '../hooks/use_api_data.js';
import { delete_note, fetch_notes, generate_notes } from '../services/study_material_service.js';
import { format_date } from '../utils/format.js';
import AlertMessage from './AlertMessage.jsx';
import { get_button_classes } from './button_styles.js';
import ExplainAnotherWay from './learn/ExplainAnotherWay.jsx';
import MarkdownContent from './MarkdownContent.jsx';
import TopicGenerator from './TopicGenerator.jsx';

// One saved note as an expandable <details> block (keyboard and screen reader friendly
// without extra code), with "explain it another way". The newest note opens automatically.
function NoteItem({ note, is_initially_open, on_delete }) {
  return (
    <li>
      <details open={is_initially_open} className="group rounded-lg border border-border bg-surface">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
            {note.topic}
          </span>
          <span className="text-caption text-ink-muted">{format_date(note.created_at)}</span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          <MarkdownContent markdown_text={note.content} />
          <ExplainAnotherWay skill_id={note.skill_id} text={note.content} topic_id={note.skill_node_id} />
          <button type="button" onClick={() => on_delete(note)} className={get_button_classes('ghost', 'self-start px-2')}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Delete these notes
          </button>
        </div>
      </details>
    </li>
  );
}

// AI study notes for a skill: generate notes on a topic, then read or delete them.
function NotesPanel({ skill }) {
  const notes_state = use_api_data(() => fetch_notes(skill.id), [skill.id]);
  const [newest_note_id, set_newest_note_id] = useState(null);
  const [action_error, set_action_error] = useState('');

  async function handle_generate(topic) {
    const note = await generate_notes(skill.id, topic);
    notes_state.set_data((current_notes) => [note, ...(current_notes ?? [])]);
    set_newest_note_id(note.id);
  }

  const confirm = use_confirm();

  async function handle_delete(note) {
    const message = `Your notes on "${note.topic}" are deleted.`;
    if (!(await confirm({ title: 'Delete these notes?', message, confirm_label: 'Delete' }))) return;
    set_action_error('');
    try {
      await delete_note(note.id);
      notes_state.set_data((current_notes) => current_notes.filter((item) => item.id !== note.id));
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  return (
    <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
      <h2 id="notes-heading" className="text-heading-2 font-bold text-ink">
        Study notes
      </h2>
      <TopicGenerator
        field_id="notes-topic"
        button_label="Make notes"
        busy_label="Writing notes…"
        has_resources={skill.resource_count > 0}
        on_generate={handle_generate}
      />
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {notes_state.error && <AlertMessage>{notes_state.error}</AlertMessage>}
      {notes_state.data?.length > 0 && (
        <ul className="flex flex-col gap-2">
          {notes_state.data.map((note) => (
            <NoteItem key={note.id} note={note} is_initially_open={note.id === newest_note_id} on_delete={handle_delete} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default NotesPanel;
