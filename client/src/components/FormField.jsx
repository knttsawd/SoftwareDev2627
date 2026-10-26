// A labelled text input with optional hint and error text. The hint and error are linked
// with aria-describedby so screen readers read them with the field, and aria-invalid
// marks the field as wrong without relying on the red border.
//
// Props: field_id, label, value, on_change(new_value), error, hint, plus any normal
// <input> attributes (type, autoComplete, required, onBlur...).
function FormField({ field_id, label, value, on_change, error, hint, ...input_attributes }) {
  const hint_id = `${field_id}-hint`;
  const error_id = `${field_id}-error`;
  const described_by = [hint && hint_id, error && error_id].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={field_id} className="text-small font-semibold text-ink">
        {label}
      </label>
      <input
        id={field_id}
        name={field_id}
        value={value}
        onChange={(change_event) => on_change(change_event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={described_by}
        className={`rounded-lg border bg-surface px-3 py-2.5 text-body text-ink ${error ? 'border-danger' : 'border-border'}`}
        {...input_attributes}
      />
      {hint && (
        <p id={hint_id} className="text-caption text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={error_id} className="text-caption font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export default FormField;
