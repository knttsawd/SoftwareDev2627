import { Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { GLOSSARY_DEFINITION_MAX_LENGTH, GLOSSARY_TERM_MAX_LENGTH } from '../../config/constants.js';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { use_api_data } from '../../hooks/use_api_data.js';
import { add_glossary_term, delete_glossary_term, fetch_glossary, generate_glossary } from '../../services/learning_service.js';
import { fetch_topic_map } from '../../services/topic_service.js';
import { build_topic_tree, find_topic_name, flatten_topic_tree, format_indented_name } from '../../utils/topic_tree.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import FormField from '../FormField.jsx';

const EMPTY_TERM_FORM = { term: '', definition: '', topic_id: '' };

// The terms whose name or definition contains the search text (any letter case).
export function filter_glossary_terms(terms, search_text) {
  const search = search_text.trim().toLowerCase();
  if (!search) return terms;
  return terms.filter((glossary_term) => `${glossary_term.term} ${glossary_term.definition}`.toLowerCase().includes(search));
}

// "Added 5 new key terms." or a note that nothing new was found.
export function describe_added_terms(added_count) {
  if (added_count === 0) return 'No new key terms this time: you already have the ones the AI found.';
  return `Added ${added_count} new key term${added_count === 1 ? '' : 's'}.`;
}

// Inserts a term into an alphabetical list.
export function insert_term_in_order(terms, new_term) {
  return [...terms, new_term].sort((first, second) => first.term.localeCompare(second.term, undefined, { sensitivity: 'base' }));
}

// The form for adding a term by hand, folded away until it's wanted. on_added(term)
// receives the saved term.
function AddTermForm({ skill_id, topic_nodes, on_added }) {
  const [form_values, set_form_values] = useState(EMPTY_TERM_FORM);
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_saving, set_is_saving] = useState(false);

  function set_value(field_name, value) {
    set_form_values((current_values) => ({ ...current_values, [field_name]: value }));
  }

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_is_saving(true);
    set_field_errors({});
    set_form_error('');
    try {
      const { topic_id, ...term_details } = form_values;
      on_added(await add_glossary_term(skill_id, topic_id ? { ...term_details, topic_id } : term_details));
      set_form_values(EMPTY_TERM_FORM);
    } catch (save_error) {
      set_field_errors(save_error.field_errors ?? {});
      set_form_error(save_error.message);
    } finally {
      set_is_saving(false);
    }
  }

  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-ink">
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add a term yourself
      </summary>
      <form onSubmit={handle_submit} noValidate className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <FormField
          field_id="glossary-term"
          label="Term"
          value={form_values.term}
          maxLength={GLOSSARY_TERM_MAX_LENGTH}
          on_change={(value) => set_value('term', value)}
          error={field_errors.term}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="glossary-definition" className="text-small font-semibold text-ink">
            Definition
          </label>
          <textarea
            id="glossary-definition"
            value={form_values.definition}
            maxLength={GLOSSARY_DEFINITION_MAX_LENGTH}
            rows={2}
            aria-invalid={field_errors.definition ? true : undefined}
            aria-describedby={field_errors.definition ? 'glossary-definition-error' : undefined}
            onChange={(change_event) => set_value('definition', change_event.target.value)}
            className={`rounded-lg border bg-surface px-3 py-2.5 text-body ${field_errors.definition ? 'border-danger' : 'border-border'}`}
          />
          {field_errors.definition && (
            <p id="glossary-definition-error" className="text-caption font-semibold text-danger">
              {field_errors.definition}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="glossary-topic" className="text-small font-semibold text-ink">
            Topic (optional)
          </label>
          <select
            id="glossary-topic"
            value={form_values.topic_id}
            onChange={(change_event) => set_value('topic_id', change_event.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-body"
          >
            <option value="">No topic</option>
            {topic_nodes.map((tree_node) => (
              <option key={tree_node.topic.id} value={tree_node.topic.id}>
                {format_indented_name(tree_node)}
              </option>
            ))}
          </select>
        </div>
        {form_error && <AlertMessage>{form_error}</AlertMessage>}
        <button type="submit" disabled={is_saving} className={get_button_classes('primary', 'self-start')}>
          {is_saving ? 'Saving…' : 'Add term'}
        </button>
      </form>
    </details>
  );
}

// The Key terms tab: the skill's glossary, a search box, "Find key terms" (the AI picks
// them out of the resources) and adding or deleting terms by hand.
function GlossaryPanel({ skill }) {
  const terms_state = use_api_data(() => fetch_glossary(skill.id), [skill.id]);
  const topic_map_state = use_api_data(() => fetch_topic_map(skill.id), [skill.id]);
  const [search_text, set_search_text] = useState('');
  const [is_finding, set_is_finding] = useState(false);
  const [status_message, set_status_message] = useState('');
  const [action_error, set_action_error] = useState('');

  const terms = terms_state.data ?? [];
  const topics = topic_map_state.data?.topics ?? [];
  const shown_terms = filter_glossary_terms(terms, search_text);

  async function find_terms() {
    set_is_finding(true);
    set_status_message('');
    set_action_error('');
    try {
      const { added_count, terms: updated_terms } = await generate_glossary(skill.id);
      terms_state.set_data(updated_terms);
      set_status_message(describe_added_terms(added_count));
    } catch (find_error) {
      set_action_error(find_error.message);
    } finally {
      set_is_finding(false);
    }
  }

  function handle_added(glossary_term) {
    terms_state.set_data((current_terms) => insert_term_in_order(current_terms ?? [], glossary_term));
    set_status_message(`Added "${glossary_term.term}".`);
  }

  const confirm = use_confirm();

  async function handle_delete(glossary_term) {
    const message = `"${glossary_term.term}" is removed from your key terms.`;
    if (!(await confirm({ title: 'Delete this key term?', message, confirm_label: 'Delete' }))) return;
    set_action_error('');
    try {
      await delete_glossary_term(skill.id, glossary_term.id);
      terms_state.set_data((current_terms) => current_terms.filter((current_term) => current_term.id !== glossary_term.id));
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  return (
    <section aria-labelledby="glossary-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="glossary-heading" className="text-heading-2 font-bold text-ink">
            Key terms
          </h2>
          <p className="text-body text-ink-muted">The words you need to know for {skill.name}, in plain language.</p>
        </div>
        <button type="button" onClick={find_terms} disabled={is_finding} className={get_button_classes('primary')}>
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          {is_finding ? 'Finding key terms…' : 'Find key terms'}
        </button>
      </div>
      {status_message && <AlertMessage tone="success">{status_message}</AlertMessage>}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {terms_state.error && <AlertMessage>{terms_state.error}</AlertMessage>}

      <AddTermForm
        skill_id={skill.id}
        topic_nodes={flatten_topic_tree(build_topic_tree(topics))}
        on_added={handle_added}
      />

      {terms.length > 0 && (
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <label htmlFor="glossary-search" className="text-small font-semibold text-ink">
            Search key terms
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
            <Search aria-hidden="true" className="h-4 w-4 text-ink-muted" />
            <input
              id="glossary-search"
              type="search"
              value={search_text}
              onChange={(change_event) => set_search_text(change_event.target.value)}
              className="w-full bg-transparent py-2.5 text-body outline-none"
            />
          </div>
        </div>
      )}

      {terms_state.data && terms.length === 0 && (
        <p className="text-small text-ink-muted">No key terms yet. Press "Find key terms" to pick them out of your resources.</p>
      )}
      {terms.length > 0 && shown_terms.length === 0 && <p className="text-small text-ink-muted">No terms match "{search_text}".</p>}
      {shown_terms.length > 0 && (
        <dl className="flex flex-col gap-2">
          {shown_terms.map((glossary_term) => {
            const topic_name = glossary_term.topic_id ? find_topic_name(topics, glossary_term.topic_id) : '';
            return (
              <div key={glossary_term.id} className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3">
                <dt className="flex items-start justify-between gap-3 font-semibold text-ink">
                  {glossary_term.term}
                  <button type="button" onClick={() => handle_delete(glossary_term)} className={get_button_classes('ghost', 'px-2 py-1')}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    <span className="sr-only">Delete {glossary_term.term}</span>
                  </button>
                </dt>
                <dd className="text-body text-ink">{glossary_term.definition}</dd>
                {topic_name && <dd className="text-caption text-ink-muted">Topic: {topic_name}</dd>}
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

export default GlossaryPanel;
