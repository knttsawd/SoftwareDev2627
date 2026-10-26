import { RotateCcw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DASHBOARD_PAGES } from '../../config/dashboard_pages.js';
import { DEFAULT_WIDGET_LOOK, WIDGET_LOOK_NUMBERS, WIDGET_PIN_EVERYWHERE } from '../../config/constants.js';
import { can_refract_backdrop } from '../../utils/glass.js';
import {
  get_item_title,
  WIDGET_APPEARANCE_DETAILS,
  WIDGET_CONTENT_SIZE_DETAILS,
  WIDGET_CORNER_DETAILS,
  WIDGET_GLASS_TINT_DETAILS,
  WIDGET_SHADOW_DETAILS,
} from '../../utils/widget_layout.js';
import { describe_pins, toggle_pinned_page } from '../../utils/widgets.js';
import { get_button_classes } from '../button_styles.js';
import { AccentPicker, SegmentedControl, SliderField } from './WidgetControls.jsx';

const SECTION_HEADING_CLASSES = 'text-caption font-semibold tracking-wide text-ink-muted uppercase';
const CHECK_ROW_CLASSES = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-small text-ink hover:bg-canvas';

// The look settings "Reset look" puts back: everything but the look itself and the accent.
const RESETTABLE_LOOK = Object.fromEntries(Object.entries(DEFAULT_WIDGET_LOOK).filter(([setting]) => !['appearance', 'accent'].includes(setting)));

// The glass sliders: each look number's label and unit.
const GLASS_SLIDERS = [
  { setting: 'glass_opacity', label: 'Opacity', unit: '%' },
  { setting: 'glass_frost', label: 'Frost', unit: ' px' },
  { setting: 'glass_bend', label: 'Edge bend', unit: '%' },
  { setting: 'glass_vibrance', label: 'Colour boost', unit: '%' },
];

// A titled part of the sheet.
function SheetSection({ title, children }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className={SECTION_HEADING_CLASSES}>{title}</h3>
      {children}
    </section>
  );
}

// The pages an item shows on: every page, or a choice of pages, as checkboxes.
function PagesSection({ frame_id, pinned_paths, on_pins_change }) {
  const is_everywhere = pinned_paths.includes(WIDGET_PIN_EVERYWHERE);
  return (
    <SheetSection title="Pages">
      <p className="text-small text-ink-muted">Shows on: {describe_pins(pinned_paths)}</p>
      <label className={`${CHECK_ROW_CLASSES} font-semibold`}>
        <input
          type="checkbox"
          checked={is_everywhere}
          onChange={() => on_pins_change(is_everywhere ? [] : [WIDGET_PIN_EVERYWHERE])}
          className="h-4 w-4 accent-brand-600"
        />
        Every page
      </label>
      <fieldset className="flex flex-col">
        <legend className="sr-only">Pages</legend>
        {DASHBOARD_PAGES.map((dashboard_page) => {
          const page_path = `/dashboard/${dashboard_page.path}`;
          return (
            <label key={page_path} htmlFor={`${frame_id}-page-${dashboard_page.path}`} className={CHECK_ROW_CLASSES}>
              <input
                id={`${frame_id}-page-${dashboard_page.path}`}
                type="checkbox"
                checked={is_everywhere || pinned_paths.includes(page_path)}
                onChange={() => on_pins_change(toggle_pinned_page(pinned_paths, page_path))}
                className="h-4 w-4 accent-brand-600"
              />
              <dashboard_page.icon aria-hidden="true" className="h-4 w-4 text-ink-muted" />
              {dashboard_page.label}
            </label>
          );
        })}
      </fieldset>
    </SheetSection>
  );
}

// The Customize panel for an item: a sheet at the side of the screen (side "right" or
// "left", away from the assistant's panel) that changes the item as you go, like the
// settings for a widget on a phone. layout is the item's layout with any unsaved changes.
//   Look      solid, glass or tinted; accent; a tinted widget's strength; glass's tint,
//             opacity, frost, edge bend (Chromium only) and colour boost
//   Shape     corners and shadow, and content size
//   Pages     every page or a choice of them (not for a widget inside a stack, whose stack
//             decides), and hiding it from every page without deleting it
// on_look_change(changes) previews and saves look changes (the window waits for sliders
// to settle); on_pins_change(pinned_paths) and on_hidden_change(is_hidden) save at once.
// It isn't modal, so the page stays usable; Escape or Done closes it (on_close).
function CustomizeSheet({ item, layout, frame_id, side = 'right', can_change_pages, on_look_change, on_pins_change, on_hidden_change, on_close }) {
  const done_ref = useRef(null);
  const title = get_item_title(item);
  const heading_id = `${frame_id}-customize-heading`;

  useEffect(() => {
    done_ref.current?.focus();
  }, []);

  function handle_key_down(key_event) {
    if (key_event.key !== 'Escape') return;
    key_event.stopPropagation();
    on_close();
  }

  const slider = (setting, label, unit) => (
    <SliderField
      key={setting}
      id={`${frame_id}-${setting}`}
      label={label}
      unit={unit}
      value={layout[setting]}
      min={WIDGET_LOOK_NUMBERS[setting].min}
      max={WIDGET_LOOK_NUMBERS[setting].max}
      on_change={(value) => on_look_change({ [setting]: value })}
    />
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={heading_id}
      onKeyDown={handle_key_down}
      className={`fixed top-0 z-[60] flex h-full w-[22rem] max-w-full animate-widget-pop flex-col border-border bg-surface text-ink shadow-2xl ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'}`}
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id={heading_id} className="text-body font-semibold">
            Customize
          </h2>
          <p className="truncate text-small text-ink-muted">{title}</p>
        </div>
        <button ref={done_ref} type="button" onClick={on_close} className={get_button_classes('secondary', 'px-3 py-1.5 text-small')}>
          Done
        </button>
        <button type="button" onClick={on_close} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink">
          <X aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <SheetSection title="Look">
          <SegmentedControl
            legend="Style"
            name={`${frame_id}-appearance`}
            options={WIDGET_APPEARANCE_DETAILS}
            value={layout.appearance}
            on_change={(appearance) => on_look_change({ appearance })}
          />
          <AccentPicker name={`${frame_id}-accent`} value={layout.accent} on_change={(accent) => on_look_change({ accent })} />
          {layout.appearance === 'tinted' && slider('tint_strength', 'Tint strength', '%')}
          {layout.appearance === 'glass' && (
            <>
              <SegmentedControl
                legend="Glass tint"
                name={`${frame_id}-glass-tint`}
                options={WIDGET_GLASS_TINT_DETAILS}
                value={layout.glass_tint}
                on_change={(glass_tint) => on_look_change({ glass_tint })}
              />
              {GLASS_SLIDERS.map(({ setting, label, unit }) => slider(setting, label, unit))}
              <p className="text-caption text-ink-muted">
                Opacity 0% is clear glass. Colour boost above 100% makes what&apos;s behind more vivid.
                {!can_refract_backdrop() && ' Edge bend shows in Chrome and Edge.'}
              </p>
            </>
          )}
        </SheetSection>
        <SheetSection title="Shape">
          <SegmentedControl legend="Corners" name={`${frame_id}-corners`} options={WIDGET_CORNER_DETAILS} value={layout.corners} on_change={(corners) => on_look_change({ corners })} />
          <SegmentedControl legend="Shadow" name={`${frame_id}-shadow`} options={WIDGET_SHADOW_DETAILS} value={layout.shadow} on_change={(shadow) => on_look_change({ shadow })} />
          <SegmentedControl
            legend="Content size"
            name={`${frame_id}-content-size`}
            options={WIDGET_CONTENT_SIZE_DETAILS}
            value={layout.content_size ?? 'auto'}
            on_change={(content_size) => on_look_change({ content_size })}
          />
          <button type="button" onClick={() => on_look_change(RESETTABLE_LOOK)} className={get_button_classes('ghost', 'self-start px-2 py-1 text-small')}>
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Reset look
          </button>
        </SheetSection>
        {can_change_pages && <PagesSection frame_id={frame_id} pinned_paths={item.pinned_paths} on_pins_change={on_pins_change} />}
        <SheetSection title="Visibility">
          <label className={CHECK_ROW_CLASSES}>
            <input type="checkbox" checked={layout.is_hidden} onChange={() => on_hidden_change(!layout.is_hidden)} className="h-4 w-4 accent-brand-600" />
            Hide from every page
          </label>
          <p className="text-caption text-ink-muted">A hidden widget isn&apos;t deleted: it stays in the assistant&apos;s Widgets tab, ready to show again.</p>
        </SheetSection>
      </div>
    </div>,
    document.body,
  );
}

export default CustomizeSheet;
