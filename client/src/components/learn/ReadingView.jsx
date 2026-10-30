import { ChevronLeft, ChevronRight, MessageCircleQuestion } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { READING_PASSAGE_MAX_LENGTH } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import {
  explain_reading_passage,
  fetch_reading,
  fetch_reading_section,
  guide_reading_section,
  save_reading_position,
} from '../../services/learning_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import MarkdownContent from '../MarkdownContent.jsx';
import ExplainAnotherWay from './ExplainAnotherWay.jsx';

// The text the student has selected inside container, trimmed and cut to what can be
// explained, or '' when the selection is somewhere else.
export function read_selected_passage(container, selection = window.getSelection()) {
  if (!container || !selection || selection.rangeCount === 0 || !container.contains(selection.anchorNode)) return '';
  return selection.toString().trim().slice(0, READING_PASSAGE_MAX_LENGTH);
}

// A box for a passage (selected in the text, pasted or typed) and the AI's plain-language
// explanation of it.
function PassageExplainer({ resource_id, section_index, passage, set_passage }) {
  const [explanation_markdown, set_explanation_markdown] = useState('');
  const [is_busy, set_is_busy] = useState(false);
  const [action_error, set_action_error] = useState('');
  const field_id = `passage-${resource_id}-${section_index}`;

  async function handle_explain(submit_event) {
    submit_event.preventDefault();
    set_is_busy(true);
    set_action_error('');
    try {
      set_explanation_markdown((await explain_reading_passage(resource_id, section_index, passage)).explanation_markdown);
    } catch (explain_error) {
      set_action_error(explain_error.message);
    } finally {
      set_is_busy(false);
    }
  }

  return (
    <form onSubmit={handle_explain} noValidate className="flex flex-col gap-2">
      <label htmlFor={field_id} className="flex items-center gap-2 font-semibold text-ink">
        <MessageCircleQuestion aria-hidden="true" className="h-4 w-4 text-brand-700" />
        Stuck on something?
      </label>
      <p id={`${field_id}-hint`} className="text-caption text-ink-muted">
        Select words in the text to copy them here, or type a passage or question.
      </p>
      <textarea
        id={field_id}
        aria-describedby={`${field_id}-hint`}
        value={passage}
        maxLength={READING_PASSAGE_MAX_LENGTH}
        rows={3}
        onChange={(change_event) => set_passage(change_event.target.value)}
        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
      />
      <button type="submit" disabled={!passage.trim() || is_busy} className={get_button_classes('secondary', 'self-start')}>
        {is_busy ? 'Explaining…' : 'Explain this'}
      </button>
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      <div aria-live="polite">{explanation_markdown && <MarkdownContent markdown_text={explanation_markdown} />}</div>
    </form>
  );
}

// The guide to one section: the AI's plain-language explanation (written the first time
// the section is opened, then kept) and a question to think about.
function SectionGuide({ resource_id, section_index }) {
  const guide_state = use_api_data(() => guide_reading_section(resource_id, section_index), [resource_id, section_index], {
    live: false,
  });
  const guide = guide_state.data?.guide;

  return (
    <section aria-labelledby="section-guide-heading" aria-busy={guide_state.is_loading} className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <h3 id="section-guide-heading" className="text-heading-3 font-semibold text-ink">
        Guide to this section
      </h3>
      {guide_state.error && <AlertMessage>{guide_state.error}</AlertMessage>}
      {!guide && !guide_state.error && <p className="text-small text-ink-muted">Writing a guide to this section…</p>}
      {guide && (
        <>
          <MarkdownContent markdown_text={guide.explanation_markdown} />
          <div className="rounded-lg bg-surface p-3">
            <p className="text-small font-semibold text-ink">Think about</p>
            <p className="text-body text-ink">{guide.think_about}</p>
          </div>
        </>
      )}
    </section>
  );
}

// One section: its text (select words to ask about them), the guide, "explain another
// way" and the passage box. focus_on_open moves focus to the heading, for when the student
// moves between sections.
function ReadingSection({ resource, section_index, focus_on_open }) {
  const section_state = use_api_data(() => fetch_reading_section(resource.id, section_index), [resource.id, section_index], {
    live: false,
  });
  const [passage, set_passage] = useState('');
  const heading_ref = useRef(null);
  const text_ref = useRef(null);
  const section = section_state.data;

  useEffect(() => {
    if (focus_on_open && section) heading_ref.current?.focus();
  }, [focus_on_open, section]);

  function pick_up_selection() {
    const selected_passage = read_selected_passage(text_ref.current);
    if (selected_passage) set_passage(selected_passage);
  }

  if (section_state.error) return <AlertMessage>{section_state.error}</AlertMessage>;
  if (!section) return <p className="text-small text-ink-muted">Loading the section…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <article aria-labelledby="reading-section-heading" className="flex flex-col gap-4 self-start rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 id="reading-section-heading" ref={heading_ref} tabIndex={-1} className="text-heading-2 font-bold text-ink">
          {section.title}
        </h2>
        <div ref={text_ref} onMouseUp={pick_up_selection} onKeyUp={pick_up_selection} className="flex flex-col gap-3">
          {section.text.split('\n\n').map((paragraph, paragraph_index) => (
            <p key={paragraph_index} className="whitespace-pre-line text-body leading-relaxed text-ink">
              {paragraph}
            </p>
          ))}
        </div>
      </article>
      <div className="flex flex-col gap-5">
        <SectionGuide resource_id={resource.id} section_index={section_index} />
        <ExplainAnotherWay skill_id={resource.skill_id} text={section.text} topic_id={resource.topic_id} />
        <PassageExplainer resource_id={resource.id} section_index={section_index} passage={passage} set_passage={set_passage} />
      </div>
    </div>
  );
}

// Reads one resource a section at a time, starting where the student left off. Moving to
// another section saves the place.
function ReadingView({ resource_id }) {
  const overview_state = use_api_data(() => fetch_reading(resource_id), [resource_id], { live: false });
  const [chosen_index, set_chosen_index] = useState(null);
  const [action_error, set_action_error] = useState('');
  const overview = overview_state.data;

  if (overview_state.error) return <AlertMessage>{overview_state.error}</AlertMessage>;
  if (!overview) return <p className="text-small text-ink-muted">Opening your resource…</p>;
  if (overview.sections.length === 0) return <p className="text-body text-ink">This resource has no text to read.</p>;

  const section_count = overview.sections.length;
  const section_index = chosen_index ?? overview.position;

  async function go_to_section(next_index) {
    set_chosen_index(next_index);
    set_action_error('');
    try {
      await save_reading_position(resource_id, next_index);
    } catch (save_error) {
      set_action_error(`Your place wasn't saved: ${save_error.message}`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="text-small font-semibold text-brand-700">
          {overview.resource.title} · Section {section_index + 1} of {section_count}
        </p>
        <progress
          value={section_index + 1}
          max={section_count}
          aria-label={`Reading progress: section ${section_index + 1} of ${section_count}`}
          className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
        />
        <div className="flex flex-col gap-1.5 sm:max-w-md">
          <label htmlFor="reading-section-picker" className="text-small font-semibold text-ink">
            Go to section
          </label>
          <select
            id="reading-section-picker"
            value={section_index}
            onChange={(change_event) => go_to_section(Number(change_event.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
          >
            {overview.sections.map((section) => (
              <option key={section.index} value={section.index}>
                {section.index + 1}. {section.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {action_error && <AlertMessage>{action_error}</AlertMessage>}

      <ReadingSection key={section_index} resource={overview.resource} section_index={section_index} focus_on_open={chosen_index !== null} />

      <nav aria-label="Sections" className="flex flex-wrap justify-between gap-3">
        <button
          type="button"
          onClick={() => go_to_section(section_index - 1)}
          disabled={section_index === 0}
          className={get_button_classes('secondary')}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Previous section
        </button>
        <button
          type="button"
          onClick={() => go_to_section(section_index + 1)}
          disabled={section_index === section_count - 1}
          className={get_button_classes('primary')}
        >
          Next section
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

export default ReadingView;
