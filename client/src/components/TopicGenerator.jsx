import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import AlertMessage from './AlertMessage.jsx';
import { get_button_classes } from './button_styles.js';
import FormField from './FormField.jsx';

// The "type a topic, press Generate" form shared by the notes and quiz panels.
// on_generate(topic) does the work and throws the API error on failure.
// extra_fields renders more inputs (like the question count) beside the topic.
// While has_resources is false the form explains that the AI will use general knowledge.
function TopicGenerator({ field_id, button_label, busy_label, has_resources, on_generate, extra_fields }) {
  const [topic, set_topic] = useState('');
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_generating, set_is_generating] = useState(false);

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_is_generating(true);
    set_form_error('');
    set_field_errors({});
    try {
      await on_generate(topic);
      set_topic('');
    } catch (generate_error) {
      set_field_errors(generate_error.field_errors ?? {});
      set_form_error(generate_error.message);
    } finally {
      set_is_generating(false);
    }
  }

  return (
    <form onSubmit={handle_submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-56 flex-1">
          <FormField
            field_id={field_id}
            label="Topic"
            placeholder="e.g. Photosynthesis"
            required
            value={topic}
            on_change={set_topic}
            error={field_errors.topic}
          />
        </div>
        {extra_fields}
      </div>
      {!has_resources && (
        <p className="text-small text-ink-muted">No resources yet, so the AI will use its general knowledge.</p>
      )}
      {form_error && <AlertMessage>{form_error}</AlertMessage>}
      <button
        type="submit"
        disabled={is_generating}
        className={get_button_classes('primary', 'self-start')}
      >
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        {is_generating ? busy_label : button_label}
      </button>
    </form>
  );
}

export default TopicGenerator;
