import { Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { EXPLAIN_TEXT_MAX_LENGTH } from '../../config/constants.js';
import { explain_another_way } from '../../services/learning_service.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';
import MarkdownContent from '../MarkdownContent.jsx';

// The ways an explanation can be rewritten: the button's label and the result's heading.
export const EXPLAIN_STYLE_DETAILS = {
  simpler: { label: 'Simpler', heading: 'In simpler words' },
  analogy: { label: 'Give an analogy', heading: 'As an analogy' },
  example: { label: 'Show an example', heading: 'With an example' },
  deeper: { label: 'Go deeper', heading: 'Going deeper' },
};

// Buttons that ask the AI to explain text another way (simpler, with an analogy, with an
// example, or in more depth), and the answer underneath. topic_id, when given, points the
// AI at that topic's resources. Long text is trimmed to what the server accepts.
function ExplainAnotherWay({ skill_id, text, topic_id = null }) {
  const [explanation, set_explanation] = useState(null);
  const [busy_style, set_busy_style] = useState(null);
  const [action_error, set_action_error] = useState('');

  async function explain(style) {
    set_busy_style(style);
    set_action_error('');
    try {
      const { explanation_markdown } = await explain_another_way(skill_id, {
        text: text.slice(0, EXPLAIN_TEXT_MAX_LENGTH),
        style,
        ...(topic_id ? { topic_id } : {}),
      });
      set_explanation({ style, explanation_markdown });
    } catch (explain_error) {
      set_action_error(explain_error.message);
    } finally {
      set_busy_style(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Explain it another way" className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-small font-semibold text-ink">
          <Lightbulb aria-hidden="true" className="h-4 w-4 text-brand-700" />
          Explain it another way:
        </span>
        {Object.entries(EXPLAIN_STYLE_DETAILS).map(([style, { label }]) => (
          <button
            key={style}
            type="button"
            onClick={() => explain(style)}
            disabled={Boolean(busy_style)}
            className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}
          >
            {busy_style === style ? 'Explaining…' : label}
          </button>
        ))}
      </div>
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      <div aria-live="polite">
        {explanation && (
          <div className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">{EXPLAIN_STYLE_DETAILS[explanation.style].heading}</p>
              <button type="button" onClick={() => set_explanation(null)} className={get_button_classes('ghost', 'px-2 py-1')}>
                <X aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">Close this explanation</span>
              </button>
            </div>
            <MarkdownContent markdown_text={explanation.explanation_markdown} />
          </div>
        )}
      </div>
    </div>
  );
}

export default ExplainAnotherWay;
