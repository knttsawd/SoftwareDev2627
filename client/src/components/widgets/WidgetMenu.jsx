import { AppWindow, ArrowLeft, ArrowRight, Ellipsis, Eye, EyeOff, Layers, PanelTop, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WIDGET_TITLE_MAX_LENGTH } from '../../config/constants.js';
import { find_active_member, get_item_title, WIDGET_WIDTH_DETAILS } from '../../utils/widget_layout.js';
import { describe_pins } from '../../utils/widgets.js';
import { get_button_classes } from '../button_styles.js';
import { SegmentedControl } from './WidgetControls.jsx';

const SMALL_BUTTON = 'px-2 py-1 text-small';
// The menu keeps MENU_EDGE_GAP_PX from the window's edges. It opens upward when there's
// less than MENU_COMFORTABLE_HEIGHT_PX below its button and more room above, and is never
// squeezed below MENU_MIN_HEIGHT_PX (it scrolls inside instead).
const MENU_EDGE_GAP_PX = 16;
const MENU_COMFORTABLE_HEIGHT_PX = 420;
const MENU_MIN_HEIGHT_PX = 200;
const FIELD_LABEL_CLASSES = 'mb-1.5 block text-caption font-semibold tracking-wide text-ink-muted uppercase';

const MODE_OPTIONS = [
  { id: 'docked', label: 'Docked', icon: PanelTop },
  { id: 'floating', label: 'Floating', icon: AppWindow },
];
const ANCHOR_OPTIONS = [
  { id: 'page', label: 'On the page' },
  { id: 'screen', label: 'On screen' },
];
const VIEW_OPTIONS = [
  { id: 'swipe', label: 'Swipe' },
  { id: 'list', label: 'List' },
];
const SIZE_OPTIONS = WIDGET_WIDTH_DETAILS.map(({ id, label }) => ({ id, label: label.replace(' width', '') }));

// Which way a menu opens from a button at button_rect in a window viewport_height tall:
// { opens_up, max_height }.
export function place_menu(button_rect, viewport_height) {
  const space_below = viewport_height - button_rect.bottom - MENU_EDGE_GAP_PX;
  const space_above = button_rect.top - MENU_EDGE_GAP_PX;
  const opens_up = space_below < MENU_COMFORTABLE_HEIGHT_PX && space_above > space_below;
  return { opens_up, max_height: Math.max(MENU_MIN_HEIGHT_PX, opens_up ? space_above : space_below) };
}

// The "Rename" field: saves the new title (on_rename(title)) when it's different.
function RenameForm({ field_id, title, on_rename }) {
  const [draft_title, set_draft_title] = useState(title);
  const clean_title = draft_title.trim();

  function handle_submit(submit_event) {
    submit_event.preventDefault();
    if (clean_title && clean_title !== title) on_rename(clean_title);
  }

  return (
    <form onSubmit={handle_submit}>
      <label htmlFor={field_id} className={FIELD_LABEL_CLASSES}>
        Title
      </label>
      <div className="flex gap-2">
        <input
          id={field_id}
          value={draft_title}
          maxLength={WIDGET_TITLE_MAX_LENGTH}
          onChange={(change_event) => set_draft_title(change_event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-small text-ink"
        />
        <button type="submit" disabled={!clean_title || clean_title === title} className={get_button_classes('secondary', SMALL_BUTTON)}>
          Rename
        </button>
      </div>
    </form>
  );
}

// Where and how an item sits on the page: docked (size, place) or floating (where it stays).
function LayoutSection({ frame_id, item, can_float, page_controls, on_layout_change }) {
  const { layout } = item;
  const has_float_size = layout.float_width !== null || layout.float_height !== null;
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl legend="Layout" name={`${frame_id}-mode`} options={MODE_OPTIONS} value={layout.mode} on_change={(mode) => on_layout_change({ mode })} />
      {layout.mode === 'floating' && !can_float && <p className="text-caption text-ink-muted">Floating needs a wider window, so it's docked here.</p>}
      {layout.mode === 'floating' ? (
        <>
          <SegmentedControl legend="Stays" name={`${frame_id}-anchor`} options={ANCHOR_OPTIONS} value={layout.anchor} on_change={(anchor) => on_layout_change({ anchor })} />
          {has_float_size && (
            <button type="button" onClick={() => on_layout_change({ float_width: null, float_height: null })} className={get_button_classes('ghost', `self-start ${SMALL_BUTTON}`)}>
              Reset size
            </button>
          )}
        </>
      ) : (
        <>
          <SegmentedControl legend="Size" name={`${frame_id}-width`} options={SIZE_OPTIONS} value={layout.width} on_change={(width) => on_layout_change({ width })} />
          {layout.height !== null && (
            <button type="button" onClick={() => on_layout_change({ height: null })} className={get_button_classes('ghost', `self-start ${SMALL_BUTTON}`)}>
              Fit height to content
            </button>
          )}
          {page_controls && (
            <div className="flex gap-2">
              <button type="button" disabled={!page_controls.can_move_earlier} onClick={() => page_controls.on_move(-1)} className={get_button_classes('secondary', `flex-1 ${SMALL_BUTTON}`)}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Move earlier
              </button>
              <button type="button" disabled={!page_controls.can_move_later} onClick={() => page_controls.on_move(1)} className={get_button_classes('secondary', `flex-1 ${SMALL_BUTTON}`)}>
                Move later
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// A stack's view, and taking widgets out of it; or, for a widget, stacking it with another
// item on this page (other_items).
function StackSection({ frame_id, item, other_items, handlers, choose_and_close }) {
  if (item.type === 'stack') {
    const active_member = find_active_member(item);
    return (
      <div className="flex flex-col gap-2">
        <SegmentedControl legend="Stack view" name={`${frame_id}-view`} options={VIEW_OPTIONS} value={item.record.view} on_change={handlers.on_view_change} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={choose_and_close(() => handlers.on_remove_from_stack(active_member))} className={get_button_classes('secondary', SMALL_BUTTON)}>
            Take out "{active_member.title}"
          </button>
          <button type="button" onClick={choose_and_close(handlers.on_unstack)} className={get_button_classes('ghost', SMALL_BUTTON)}>
            <Layers aria-hidden="true" className="h-4 w-4" />
            Unstack all
          </button>
        </div>
      </div>
    );
  }
  if (other_items.length === 0) return null;
  return (
    <div>
      <label htmlFor={`${frame_id}-stack`} className={FIELD_LABEL_CLASSES}>
        Stack with
      </label>
      <select
        id={`${frame_id}-stack`}
        value=""
        onChange={choose_and_close((change_event) => handlers.on_stack_with(other_items.find((other) => other.key === change_event.target.value)))}
        className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-small text-ink"
      >
        <option value="">Choose a widget…</option>
        {other_items.map((other) => (
          <option key={other.key} value={other.key}>
            {other.type === 'stack' ? `Stack: ${get_item_title(other)}` : get_item_title(other)}
          </option>
        ))}
      </select>
    </div>
  );
}

// An item's options, behind its "⋯" button, in sections like a context menu. On a page
// (placement "docked" or "floating"): its layout and stack, then customizing it (look,
// pages: see CustomizeSheet), hiding it, its title and deleting. In the assistant's Widgets
// tab or chat ("panel"): where it shows (or its stack), customizing, hiding or showing it,
// its title and deleting. page_controls ({ can_move_earlier, can_move_later, on_move }) is
// for docked items; other_items are the page's other items to stack with; stack_item is
// the stack a widget shown in the panel belongs to, if any. handlers: { on_layout_change,
// on_customize, on_hidden_change, on_view_change, on_stack_with, on_remove_from_stack,
// on_unstack, on_rename, on_delete }. It opens downward, or upward when there's more room
// there (see place_menu). The panel closes with Escape (focus goes back to the button) or a
// click outside it; Escape stops here, so it doesn't close the assistant too.
function WidgetMenu({ item, frame_id, placement, can_float, page_controls, other_items = [], stack_item = null, handlers }) {
  const [is_open, set_is_open] = useState(false);
  const [menu_place, set_menu_place] = useState({ opens_up: false, max_height: null });
  const menu_ref = useRef(null);
  const button_ref = useRef(null);
  const panel_id = `${frame_id}-menu`;
  const title = get_item_title(item);
  const titled_widget = item.type === 'stack' ? find_active_member(item) : item.record;
  const is_on_page = placement !== 'panel';

  useEffect(() => {
    if (!is_open) return undefined;
    function handle_pointer_down(pointer_event) {
      if (!menu_ref.current?.contains(pointer_event.target)) set_is_open(false);
    }
    document.addEventListener('pointerdown', handle_pointer_down);
    return () => document.removeEventListener('pointerdown', handle_pointer_down);
  }, [is_open]);

  function handle_key_down(key_event) {
    if (key_event.key !== 'Escape' || !is_open) return;
    key_event.stopPropagation();
    set_is_open(false);
    button_ref.current?.focus();
  }

  function toggle_menu() {
    if (!is_open) set_menu_place(place_menu(button_ref.current.getBoundingClientRect(), window.innerHeight));
    set_is_open(!is_open);
  }

  // Runs a choice that ends with the menu closed (renaming, deleting, stacking).
  function choose_and_close(choose) {
    return (...choice_args) => {
      set_is_open(false);
      choose(...choice_args);
    };
  }

  return (
    <div ref={menu_ref} onKeyDown={handle_key_down} className="relative">
      <button
        ref={button_ref}
        id={`${frame_id}-options`}
        type="button"
        aria-expanded={is_open}
        aria-controls={panel_id}
        onClick={toggle_menu}
        title="Options"
        className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink hover:shadow-sm aria-expanded:bg-surface aria-expanded:text-ink aria-expanded:shadow-sm"
      >
        <Ellipsis aria-hidden="true" className="h-4 w-4" />
        <span className="sr-only">Options for {title}</span>
      </button>
      {is_open && (
        <div
          id={panel_id}
          role="group"
          aria-label={`Options for ${title}`}
          style={{ maxHeight: menu_place.max_height ?? undefined }}
          className={`absolute right-0 z-40 flex w-76 max-w-[calc(100vw-2rem)] animate-widget-pop flex-col gap-4 overflow-y-auto rounded-2xl border border-border/70 bg-surface/95 p-3 text-left font-normal text-ink shadow-xl backdrop-blur-xl ${menu_place.opens_up ? 'bottom-full mb-2 origin-bottom-right' : 'top-full mt-2 origin-top-right'}`}
        >
          {is_on_page && (
            <>
              <LayoutSection frame_id={frame_id} item={item} can_float={can_float} page_controls={page_controls} on_layout_change={handlers.on_layout_change} />
              <hr className="border-border" />
              <StackSection frame_id={frame_id} item={item} other_items={other_items} handlers={handlers} choose_and_close={choose_and_close} />
            </>
          )}
          {stack_item ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-small text-ink-muted">In a stack on {describe_pins(stack_item.pinned_paths)}.</p>
              <button type="button" onClick={choose_and_close(() => handlers.on_remove_from_stack(titled_widget))} className={get_button_classes('secondary', SMALL_BUTTON)}>
                Take out of the stack
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-small text-ink-muted">
                {item.layout.is_hidden ? 'Hidden from every page.' : `Shows on: ${describe_pins(item.pinned_paths)}.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={choose_and_close(handlers.on_customize)} className={get_button_classes('secondary', SMALL_BUTTON)}>
                  <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                  Customize…
                </button>
                <button type="button" onClick={choose_and_close(() => handlers.on_hidden_change(!item.layout.is_hidden))} className={get_button_classes('ghost', SMALL_BUTTON)}>
                  {item.layout.is_hidden ? <Eye aria-hidden="true" className="h-4 w-4" /> : <EyeOff aria-hidden="true" className="h-4 w-4" />}
                  {item.layout.is_hidden ? 'Show on its pages' : 'Hide'}
                </button>
              </div>
            </div>
          )}
          <RenameForm key={titled_widget.id} field_id={`${frame_id}-title`} title={titled_widget.title} on_rename={choose_and_close((new_title) => handlers.on_rename(titled_widget, new_title))} />
          <button
            type="button"
            onClick={choose_and_close(() => handlers.on_delete(titled_widget))}
            className={get_button_classes('ghost', `self-start text-danger ${SMALL_BUTTON}`)}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {item.type === 'stack' ? `Delete "${titled_widget.title}"` : 'Delete widget'}
          </button>
        </div>
      )}
    </div>
  );
}

export default WidgetMenu;
