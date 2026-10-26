import { Activity, AppWindow, ChevronDown, FileText, GalleryHorizontalEnd, Hourglass, Layers, Link2, ListChecks, PanelTop, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FLOAT_DEFAULT_WIDTH_PX, WIDGET_KEYBOARD_MOVE_PX, WIDGET_LOOK_SAVE_DELAY_MS, WIDGET_RESIZE_STEP_PX } from '../../config/constants.js';
import { use_assistant } from '../../context/AssistantContext.jsx';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { use_element_size } from '../../hooks/use_element_size.js';
import { use_pointer_drag } from '../../hooks/use_pointer_drag.js';
import { use_widget_actions } from '../../hooks/use_widget_actions.js';
import {
  clamp_content_height,
  build_glass_filter,
  build_look_style,
  clamp_float_rect,
  describe_shape,
  describe_size,
  find_active_member,
  find_appearance_details,
  find_width_details,
  get_corner_radius,
  get_item_title,
  place_new_float,
  resize_float_rect,
  snap_float_rect,
  step_width,
  width_from_columns,
} from '../../utils/widget_layout.js';
import { can_refract_backdrop } from '../../utils/glass.js';
import AlertMessage from '../AlertMessage.jsx';
import CustomizeSheet from './CustomizeSheet.jsx';
import GlassRefraction from './GlassRefraction.jsx';
import StackView from './StackView.jsx';
import { MOVE_KEY_OFFSETS, MoveHandle, ResizeHandles, SHOW_ON_HOVER } from './WidgetHandles.jsx';
import WidgetMenu from './WidgetMenu.jsx';
import WidgetView from './WidgetView.jsx';

// Docked windows resize from their right edge, bottom edge and corner (the width snaps to
// the page's columns); floating ones from every edge and corner, freely.
const DOCKED_RESIZE_DIRECTIONS = ['e', 's', 'se'];
const FLOATING_RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
// Presses on these in the title bar work as normal instead of starting a drag.
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, label';
// Arrow keys on a floating window's grip or corner: [horizontal, vertical] steps.
const ARROW_STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// Where a dragged item would land: a bar in the gap on that side of the item under the
// pointer, or a ring around it when dropping in its middle stacks the two (find_drop_side).
const DROP_CLASSES = {
  left: 'before:absolute before:-left-2.5 before:inset-y-3 before:w-1 before:rounded-full before:bg-brand-600',
  right: 'after:absolute after:-right-2.5 after:inset-y-3 after:w-1 after:rounded-full after:bg-brand-600',
  above: 'before:absolute before:-top-2.5 before:inset-x-3 before:h-1 before:rounded-full before:bg-brand-600',
  below: 'after:absolute after:-bottom-2.5 after:inset-x-3 after:h-1 after:rounded-full after:bg-brand-600',
  center: 'ring-2 ring-brand-600 ring-offset-2 ring-offset-canvas',
};

// The icon for each kind of widget, shown in its tile by the title.
const BLOCK_ICONS = { checklist: ListChecks, countdown: Hourglass, timer: Timer, flashcards: GalleryHorizontalEnd, links: Link2, live: Activity, markdown: FileText };

// An item's icon: a stack's, an app's, or the one for a card's first block.
export function pick_item_icon(item) {
  if (item.type === 'stack') return Layers;
  if (item.record.kind === 'app') return AppWindow;
  return BLOCK_ICONS[item.record.spec.blocks?.[0]?.type] ?? FileText;
}

// The round buttons in the title bar's control capsule.
const CAPSULE_BUTTON_CLASSES =
  'flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink hover:shadow-sm';

// The badge shown while resizing: "Large · 320 px" docked, "480 × 320" floating.
export function format_size_badge(layout, is_floating) {
  if (is_floating) return `${layout.float_width ?? FLOAT_DEFAULT_WIDTH_PX} × ${layout.float_height ?? 'auto'}`;
  return `${find_width_details(layout.width).label} · ${layout.height === null ? 'auto' : `${layout.height} px`}`;
}

// One item (a widget, or a smart stack of them) in a window, like a window on a computer,
// wherever it shows:
//   "docked"    in the grid above the page: dragged by its title bar (or moved with its
//               grip's arrow keys) to reorder, or onto another item to stack them; resized
//               from its right and bottom edges
//   "floating"  above the page, where it was put: dragged by its title bar (settling against
//               the edges), resized from any edge or corner, brought to the front when touched
//   "panel"     in the assistant's Widgets tab or chat: just its content and menu
// page is { description_ids, can_float, other_items } on a page, or null in the panel.
// docked is { index, count, drop_side, get_column_width, on_move(offset), on_drag_start,
// on_drag_move(x, y), on_drag_end(was_let_go) } from WidgetShelf; floating is { z_index,
// cascade_index, get_bounds(), on_focus() } from FloatingWidgets. stack_item is the stack a
// widget shown in the panel is in. Every change shows at once and is saved (see
// use_widget_actions); sizes are announced to screen readers when a resize ends. The
// Customize panel (CustomizeSheet) changes its look live: changes show at once as a draft
// (look_draft) and are saved once they stop for WIDGET_LOOK_SAVE_DELAY_MS, or when the
// window closes. A hidden item shows only in the panel, with a "Hidden" label.
function WidgetWindow({ item, placement, id_prefix, page = null, docked = null, floating = null, stack_item = null }) {
  const { announce } = use_assistant();
  const actions = use_widget_actions();
  const confirm = use_confirm();
  const [is_open_here, set_is_open_here] = useState(true);
  const [preview, set_preview] = useState(null);
  const [action_error, set_action_error] = useState('');
  const [is_customizing, set_is_customizing] = useState(false);
  const [look_draft, set_look_draft] = useState(null);
  const look_draft_ref = useRef(null);
  const look_timer = useRef(null);
  const latest = useRef(null);
  const window_ref = useRef(null);
  const content_ref = useRef(null);
  const gesture_start = useRef(null);
  const frame_id = `${id_prefix}-${item.id}`;
  const layout = { ...item.layout, ...look_draft, ...preview?.layout };
  const title = get_item_title(item);
  const is_on_page = placement !== 'panel';
  const is_floating = placement === 'floating';
  const is_expanded = is_on_page ? !layout.is_collapsed : is_open_here;
  const docked_height = placement === 'docked' ? layout.height : null;
  // A single app takes a docked height itself; anything else scrolls within it.
  const is_single_app = item.type === 'widget' && item.record.kind === 'app';
  const scrolls_in_height = docked_height !== null && !is_single_app;
  // The content lays itself out for the space it has (see describe_shape).
  const is_height_fixed = (placement === 'docked' && layout.height !== null) || (is_floating && layout.float_height !== null);
  const shape = describe_shape(use_element_size(content_ref), { is_height_fixed, content_size: layout.content_size });
  const window_size = use_element_size(window_ref, 'border');
  const ItemIcon = pick_item_icon(item);
  latest.current = { item, actions };

  // Saves the look changes waiting in the draft, if any. The save shows at once, so the draft
  // can go.
  function save_look_draft() {
    clearTimeout(look_timer.current);
    const draft = look_draft_ref.current;
    if (!draft) return;
    look_draft_ref.current = null;
    run(latest.current.actions.save_layout(latest.current.item, draft));
    set_look_draft(null);
  }

  useEffect(() => save_look_draft, []);

  // Shows look changes at once and saves them when they stop.
  function change_look(look_changes) {
    look_draft_ref.current = { ...look_draft_ref.current, ...look_changes };
    set_look_draft(look_draft_ref.current);
    clearTimeout(look_timer.current);
    look_timer.current = setTimeout(save_look_draft, WIDGET_LOOK_SAVE_DELAY_MS);
  }

  function close_customize() {
    save_look_draft();
    set_is_customizing(false);
    document.getElementById(`${frame_id}-options`)?.focus();
  }

  // Hides the item from every page, or shows it again.
  function change_hidden(is_hidden) {
    announce(is_hidden ? `${title} is hidden. It's still in the Widgets tab.` : `${title} shows on its pages again.`);
    change_layout({ is_hidden });
  }

  // Saves through use_widget_actions, showing what went wrong if it fails.
  async function run(saving) {
    set_action_error('');
    const error_message = await saving;
    if (error_message) set_action_error(error_message);
  }

  // Saves layout changes, saying announcement aloud first when there is one.
  function change_layout(layout_changes, announcement = null) {
    if (announcement) announce(announcement);
    run(actions.save_layout(item, layout_changes));
  }

  // "Exam prep: Large, 320 pixels tall." for a layout, docked or floating.
  function describe_layout(described_layout) {
    const floating_size = is_floating ? { width: described_layout.float_width ?? FLOAT_DEFAULT_WIDTH_PX, height: described_layout.float_height } : null;
    return `${title}: ${describe_size(described_layout, floating_size)}.`;
  }

  // Where a floating window shows, kept inside its bounds: { x, y, width, height }.
  function get_float_rect(current_layout) {
    const bounds = floating.get_bounds();
    const width = current_layout.float_width ?? FLOAT_DEFAULT_WIDTH_PX;
    const height = current_layout.float_height ?? window_ref.current?.offsetHeight ?? 0;
    const position =
      current_layout.x === null ? place_new_float(bounds, width, floating.cascade_index, current_layout.anchor) : { x: current_layout.x, y: current_layout.y };
    return clamp_float_rect({ ...position, width, height }, bounds);
  }

  const title_bar_drag = use_pointer_drag({
    on_start(pointer_event) {
      const press_target = pointer_event.target;
      if (!is_on_page || (press_target.closest(INTERACTIVE_SELECTOR) && !press_target.closest('[data-drag-handle]'))) return false;
      if (!is_floating) return docked.on_drag_start();
      floating.on_focus();
      gesture_start.current = get_float_rect(layout);
      return true;
    },
    on_move(delta_x, delta_y, pointer_event) {
      if (!is_floating) {
        set_preview({ offset: { x: delta_x, y: delta_y } });
        docked.on_drag_move(pointer_event.clientX, pointer_event.clientY);
        return;
      }
      const start = gesture_start.current;
      const moved_rect = clamp_float_rect({ ...start, x: start.x + delta_x, y: start.y + delta_y }, floating.get_bounds());
      set_preview({ layout: { x: moved_rect.x, y: moved_rect.y } });
    },
    on_end(was_let_go, delta_x, delta_y) {
      set_preview(null);
      if (!is_floating) {
        docked.on_drag_end(was_let_go);
        return;
      }
      if (!was_let_go || (delta_x === 0 && delta_y === 0)) return;
      const bounds = floating.get_bounds();
      const start = gesture_start.current;
      const placed_rect = snap_float_rect(clamp_float_rect({ ...start, x: start.x + delta_x, y: start.y + delta_y }, bounds), bounds);
      change_layout({ x: placed_rect.x, y: placed_rect.y });
    },
  });

  // The grip's keys: docked items move a place (or to either end); floating ones a step.
  function handle_move_key(key_event) {
    if (!is_floating) {
      const offset = MOVE_KEY_OFFSETS[key_event.key];
      if (offset === undefined) return false;
      docked.on_move(offset);
      return true;
    }
    const step = ARROW_STEPS[key_event.key];
    if (!step) return false;
    const rect = get_float_rect(layout);
    const moved_rect = clamp_float_rect(
      { ...rect, x: rect.x + step[0] * WIDGET_KEYBOARD_MOVE_PX, y: rect.y + step[1] * WIDGET_KEYBOARD_MOVE_PX },
      floating.get_bounds(),
    );
    change_layout({ x: moved_rect.x, y: moved_rect.y });
    return true;
  }

  function start_resize() {
    if (is_floating) {
      floating.on_focus();
      gesture_start.current = get_float_rect(layout);
      return;
    }
    gesture_start.current = { width: window_ref.current.offsetWidth, content_height: content_ref.current.offsetHeight };
  }

  // The layout changes for an edge or corner (direction) dragged by dx, dy from where it started.
  function measure_resize(direction, delta_x, delta_y) {
    const start = gesture_start.current;
    if (is_floating) {
      const resized_rect = clamp_float_rect(resize_float_rect(start, direction, delta_x, delta_y), floating.get_bounds());
      const is_vertical = /[ns]/.test(direction);
      return { x: resized_rect.x, y: resized_rect.y, float_width: resized_rect.width, float_height: is_vertical ? resized_rect.height : layout.float_height };
    }
    const layout_changes = {};
    const column_width = docked.get_column_width();
    if (direction.includes('e') && column_width) layout_changes.width = width_from_columns(Math.round((start.width + delta_x) / column_width));
    if (direction.includes('s')) layout_changes.height = clamp_content_height(start.content_height + delta_y);
    return layout_changes;
  }

  function end_resize(was_let_go, direction, delta_x, delta_y) {
    const layout_changes = was_let_go ? measure_resize(direction, delta_x, delta_y) : null;
    set_preview(null);
    if (layout_changes) change_layout(layout_changes, describe_layout({ ...item.layout, ...layout_changes }));
  }

  // The corner's arrow keys: docked, left and right change the width and up and down the
  // height; floating, they grow and shrink the window a step.
  function handle_resize_key(key_event) {
    const step = ARROW_STEPS[key_event.key];
    if (!step) return false;
    let layout_changes;
    if (is_floating) {
      const resized_rect = resize_float_rect(get_float_rect(layout), 'se', step[0] * WIDGET_RESIZE_STEP_PX, step[1] * WIDGET_RESIZE_STEP_PX);
      layout_changes = { float_width: resized_rect.width, float_height: step[1] === 0 ? layout.float_height : resized_rect.height };
    } else if (step[0] !== 0) {
      if (!docked.get_column_width()) return false;
      layout_changes = { width: step_width(layout.width, step[0]) };
    } else {
      layout_changes = { height: clamp_content_height((layout.height ?? content_ref.current.offsetHeight) + step[1] * WIDGET_RESIZE_STEP_PX) };
    }
    change_layout(layout_changes, describe_layout({ ...layout, ...layout_changes }));
    return true;
  }

  function toggle_expanded() {
    if (is_on_page) change_layout({ is_collapsed: !layout.is_collapsed });
    else set_is_open_here(!is_open_here);
  }

  function change_mode(mode) {
    change_layout({ mode }, `${title} is ${mode} now.`);
  }

  async function delete_widget(widget) {
    const message = `"${widget.title}" is removed from every page it's pinned to.`;
    if (!(await confirm({ title: 'Delete this widget?', message, confirm_label: 'Delete' }))) return;
    run(actions.delete_widget(widget));
  }

  const menu_handlers = {
    on_layout_change: (layout_changes) => (layout_changes.mode ? change_mode(layout_changes.mode) : change_layout(layout_changes)),
    on_customize: () => set_is_customizing(true),
    on_hidden_change: change_hidden,
    on_view_change: (view) => run(actions.save_stack(item.record, { view })),
    on_stack_with: (other_item) => {
      announce(`Stacked ${title} with ${get_item_title(other_item)}.`);
      run(actions.stack_together(item, other_item));
    },
    on_remove_from_stack: (widget) => run(actions.remove_from_stack(stack_item ?? item, widget)),
    on_unstack: () => run(actions.unstack(item)),
    on_rename: (widget, new_title) => run(actions.save_widget(widget, { title: new_title })),
    on_delete: delete_widget,
  };

  const float_rect = is_floating ? get_float_rect(layout) : null;
  const style = build_look_style(layout);
  // Glass bends the page behind its edges where the browser can (see GlassRefraction), on
  // the pane behind the window's content.
  const glass_filter_id = `${frame_id}-glass`;
  const is_refracting = layout.appearance === 'glass' && layout.glass_bend > 0 && can_refract_backdrop() && window_size.width > 0;
  const pane_style = is_refracting ? { backdropFilter: `url(#${glass_filter_id}) ${build_glass_filter(layout)}` } : undefined;
  if (preview?.offset) style.transform = `translate(${preview.offset.x}px, ${preview.offset.y}px) scale(1.02)`;
  if (float_rect) {
    Object.assign(style, {
      position: layout.anchor === 'screen' ? 'fixed' : 'absolute',
      left: float_rect.x,
      top: float_rect.y,
      width: float_rect.width,
      height: layout.float_height ?? undefined,
      maxHeight: floating.get_bounds().height,
      zIndex: floating.z_index,
    });
  }
  const placement_classes = {
    docked: `${find_width_details(layout.width).classes} ${preview?.offset ? 'z-20' : ''} ${DROP_CLASSES[docked?.drop_side] ?? ''}`,
    floating: 'pointer-events-auto animate-widget-pop',
    panel: '',
  }[placement];
  const can_float = Boolean(page?.can_float);
  const content_classes = [
    shape.size === 'compact' ? 'px-3' : 'px-4',
    // On a page, the bottom keeps clear of the resize corner, so the two never crowd each other.
    is_on_page ? 'pb-6' : shape.size === 'compact' ? 'pb-3' : 'pb-4',
    is_floating && 'min-h-0 flex-1 overflow-y-auto',
    scrolls_in_height && 'overflow-y-auto',
    shape.orientation && 'flex flex-col',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    // A labelled group rather than a landmark: the same widget can show in several places.
    <div
      ref={window_ref}
      role="group"
      aria-label={title}
      data-item-key={item.key}
      data-accent={layout.accent}
      data-appearance={layout.appearance}
      data-placement={placement}
      data-shadow={layout.shadow}
      data-lifted={preview?.offset ? '' : undefined}
      data-size={shape.size}
      data-orientation={shape.orientation ?? undefined}
      onPointerDownCapture={is_floating ? floating.on_focus : undefined}
      style={style}
      className={`widget-window group/window relative flex min-w-0 flex-col rounded-[var(--widget-radius)] border text-ink ${find_appearance_details(layout.appearance).classes} ${placement_classes}`}
    >
      {layout.appearance === 'glass' && (
        <>
          <span aria-hidden="true" style={pane_style} className="widget-glass-pane" />
          <span aria-hidden="true" className="widget-glass-rim" />
        </>
      )}
      {is_refracting && (
        <GlassRefraction filter_id={glass_filter_id} width={window_size.width} height={window_size.height} radius={get_corner_radius(layout)} bend={layout.glass_bend} />
      )}
      <div
        {...title_bar_drag}
        className={`flex items-center gap-2 py-2.5 pr-2.5 pl-2 select-none ${is_on_page ? 'cursor-grab touch-none active:cursor-grabbing' : 'pl-3'}`}
      >
        {is_on_page && <MoveHandle widget_title={title} description_id={page.description_ids.move} on_key={handle_move_key} />}
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--widget-accent)_16%,var(--color-surface))] text-[var(--widget-accent)]"
        >
          <ItemIcon strokeWidth={2.25} className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          onClick={toggle_expanded}
          aria-expanded={is_expanded}
          aria-controls={`${frame_id}-content`}
          className="group/title flex min-h-8 min-w-0 items-center gap-1 rounded-md py-1 pr-1 text-left text-small font-semibold text-ink"
        >
          <span className="truncate">{title}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 shrink-0 text-ink-muted opacity-60 transition group-hover/title:opacity-100 ${is_expanded ? '' : '-rotate-90'}`}
          />
        </button>
        {!is_on_page && layout.is_hidden && (
          <span className="shrink-0 rounded-full bg-[var(--widget-soft)] px-1.5 py-0.5 text-caption font-semibold text-ink-muted ring-1 ring-[var(--widget-line)] ring-inset">
            Hidden
          </span>
        )}
        {item.type === 'stack' && (
          <span className="shrink-0 rounded-full bg-[var(--widget-soft)] px-1.5 py-0.5 text-caption font-semibold text-ink-muted tabular-nums ring-1 ring-[var(--widget-line)] ring-inset">
            {item.members.indexOf(find_active_member(item)) + 1}/{item.members.length}
            <span className="sr-only"> in this stack</span>
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full p-0.5 transition-colors group-focus-within/window:bg-[var(--widget-soft)] group-hover/window:bg-[var(--widget-soft)]">
          {is_on_page && can_float && (
            <button
              type="button"
              title={is_floating ? 'Dock' : 'Float'}
              onClick={() => change_mode(is_floating ? 'docked' : 'floating')}
              className={`${CAPSULE_BUTTON_CLASSES} ${SHOW_ON_HOVER}`}
            >
              {is_floating ? <PanelTop aria-hidden="true" className="h-4 w-4" /> : <AppWindow aria-hidden="true" className="h-4 w-4" />}
              <span className="sr-only">{is_floating ? `Dock ${title}` : `Float ${title}`}</span>
            </button>
          )}
          <WidgetMenu
            item={item}
            frame_id={frame_id}
            placement={placement}
            can_float={can_float}
            page_controls={
              docked && { can_move_earlier: docked.index > 0, can_move_later: docked.index < docked.count - 1, on_move: docked.on_move }
            }
            other_items={page?.other_items ?? []}
            stack_item={stack_item}
            handlers={menu_handlers}
          />
        </div>
      </div>
      {action_error && (
        <div className="px-4 pb-2">
          <AlertMessage>{action_error}</AlertMessage>
        </div>
      )}
      <div
        ref={content_ref}
        id={`${frame_id}-content`}
        hidden={!is_expanded}
        style={scrolls_in_height ? { height: docked_height } : undefined}
        className={`px-4 pb-4 ${content_classes}`}
      >
        {item.type === 'stack' ? (
          <StackView
            stack_item={item}
            id_prefix={frame_id}
            fixed_height={null}
            shape={shape}
            accent={layout.accent}
            on_select={(widget) => run(actions.save_stack(item.record, { active_widget_id: widget.id }))}
            on_state_change={(widget, state) => run(actions.save_widget(widget, { state }))}
          />
        ) : (
          <WidgetView
            widget={item.record}
            id_prefix={frame_id}
            fixed_height={is_single_app ? docked_height : null}
            shape={shape}
            accent={layout.accent}
            on_state_change={(state) => run(actions.save_widget(item.record, { state }))}
          />
        )}
      </div>
      {is_on_page && is_expanded && (
        <ResizeHandles
          directions={is_floating ? FLOATING_RESIZE_DIRECTIONS : DOCKED_RESIZE_DIRECTIONS}
          widget_title={title}
          description_id={page.description_ids.resize}
          on_resize_start={start_resize}
          on_resize_move={(direction, delta_x, delta_y) => set_preview({ layout: measure_resize(direction, delta_x, delta_y), is_resizing: true })}
          on_resize_end={end_resize}
          on_resize_key={handle_resize_key}
        />
      )}
      {is_customizing && (
        <CustomizeSheet
          item={item}
          layout={layout}
          frame_id={frame_id}
          side={is_on_page ? 'right' : 'left'}
          can_change_pages={!stack_item}
          on_look_change={change_look}
          on_pins_change={(pinned_paths) => run(actions.save_item(item, { pinned_paths }))}
          on_hidden_change={change_hidden}
          on_close={close_customize}
        />
      )}
      {preview?.is_resizing && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-backdrop/80 px-2.5 py-1 text-caption font-semibold text-white tabular-nums shadow-lg"
        >
          {format_size_badge(layout, is_floating)}
        </span>
      )}
    </div>
  );
}

export default WidgetWindow;
