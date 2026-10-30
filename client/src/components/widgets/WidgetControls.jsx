import { WIDGET_ACCENT_DETAILS } from '../../utils/widget_layout.js';

const LEGEND_CLASSES = 'mb-1.5 text-caption font-semibold tracking-wide text-ink-muted uppercase';

// A choice of a few options shown as one pill with a sliding highlight, like a segmented
// control. It's a radio group underneath (fieldset, legend and real radio buttons), so arrow
// keys move between the options. options: [{ id, label, icon? }].
export function SegmentedControl({ legend, name, options, value, on_change }) {
  return (
    <fieldset>
      <legend className={LEGEND_CLASSES}>{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-xl bg-canvas p-0.5 ring-1 ring-border ring-inset">
        {options.map((option) => {
          const is_chosen = option.id === value;
          return (
            <label
              key={option.id}
              className={`relative flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] px-2 py-1.5 text-small whitespace-nowrap transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus ${is_chosen ? 'bg-surface font-semibold text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
            >
              <input type="radio" name={name} value={option.id} checked={is_chosen} onChange={() => on_change(option.id)} className="sr-only" />
              {option.icon && <option.icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// A labelled slider with its value shown beside the label ("25%"): a real range input, so
// arrow keys, Page Up and Page Down and Home and End work. unit follows the value.
export function SliderField({ id, label, value, min, max, step = 1, unit = '%', on_change }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-small font-medium text-ink">
          {label}
        </label>
        <output htmlFor={id} className="text-caption font-semibold text-ink-muted tabular-nums">
          {value}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(change_event) => on_change(Number(change_event.target.value))}
        className="w-full accent-brand-600"
      />
    </div>
  );
}

// The accent colors as round swatches. A radio group too; each swatch is named for screen
// readers, and the chosen one has a ring in its own color.
export function AccentPicker({ name, value, on_change }) {
  return (
    <fieldset>
      <legend className={LEGEND_CLASSES}>Accent</legend>
      <div className="flex flex-wrap gap-2 px-0.5">
        {WIDGET_ACCENT_DETAILS.map((accent) => {
          const is_chosen = accent.id === value;
          return (
            <label key={accent.id} data-accent={accent.id} className="relative cursor-pointer rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus">
              <input type="radio" name={name} value={accent.id} checked={is_chosen} onChange={() => on_change(accent.id)} className="sr-only" />
              <span
                aria-hidden="true"
                className={`block h-6 w-6 rounded-full bg-[var(--widget-accent)] transition-shadow ${is_chosen ? 'ring-2 ring-[var(--widget-accent)] ring-offset-2 ring-offset-surface' : ''}`}
              />
              <span className="sr-only">{accent.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
