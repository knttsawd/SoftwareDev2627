import { GripVertical } from 'lucide-react';
import { use_pointer_drag } from '../../hooks/use_pointer_drag.js';

// The keys that move a docked item, and how far: one place, or to the start or the end.
export const MOVE_KEY_OFFSETS = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
  Home: -Infinity,
  End: Infinity,
};

// Shown on hover or keyboard focus (and always on touch screens, which can't hover).
export const SHOW_ON_HOVER = 'opacity-0 transition-opacity group-hover/window:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

// The grip at the start of a title bar. The whole title bar moves the item with a pointer
// (data-drag-handle lets presses on the grip through); the grip is how the keyboard moves
// it: on_key(key_event) returns true when it used the key. description_id points at the
// text that explains this to screen readers.
export function MoveHandle({ widget_title, description_id, on_key }) {
  function handle_key_down(key_event) {
    if (on_key(key_event)) key_event.preventDefault();
  }

  return (
    <button
      type="button"
      data-drag-handle
      aria-describedby={description_id}
      onKeyDown={handle_key_down}
      className={`flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-ink-muted hover:text-ink active:cursor-grabbing ${SHOW_ON_HOVER}`}
    >
      <GripVertical aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only">Move {widget_title}</span>
    </button>
  );
}

// Where each edge or corner's grab area sits, just across the window's border, and the
// cursor it shows. The bottom-right corner is the visible, focusable grabber instead.
const ZONE_CLASSES = {
  n: '-top-1 inset-x-4 h-2 cursor-ns-resize',
  s: '-bottom-1 inset-x-4 h-2 cursor-ns-resize',
  e: '-right-1 inset-y-4 w-2 cursor-ew-resize',
  w: '-left-1 inset-y-4 w-2 cursor-ew-resize',
  ne: '-right-1 -top-1 h-4 w-4 cursor-nesw-resize',
  nw: '-left-1 -top-1 h-4 w-4 cursor-nwse-resize',
  sw: '-bottom-1 -left-1 h-4 w-4 cursor-nesw-resize',
};

// Builds the pointer handlers for dragging one edge or corner (direction).
function use_resize_drag(direction, { on_resize_start, on_resize_move, on_resize_end }) {
  return use_pointer_drag({
    on_start: () => on_resize_start(direction),
    on_move: (delta_x, delta_y) => on_resize_move(direction, delta_x, delta_y),
    on_end: (was_let_go, delta_x, delta_y) => on_resize_end(was_let_go, direction, delta_x, delta_y),
  });
}

// One edge or corner's invisible grab area.
function ResizeZone({ direction, resize_handlers }) {
  const drag_handlers = use_resize_drag(direction, resize_handlers);
  return <div aria-hidden="true" data-resize={direction} className={`absolute z-10 touch-none ${ZONE_CLASSES[direction]}`} {...drag_handlers} />;
}

// The edges and corners a window resizes from, like a window on a computer: directions
// lists them ("n", "se" and so on; see RESIZE_DIRECTIONS). Dragging reports
// on_resize_start(direction), on_resize_move(direction, dx, dy) and
// on_resize_end(was_let_go, direction, dx, dy). The bottom-right corner is also a button for
// the keyboard: on_resize_key(key_event) returns true when it used the key (arrows).
export function ResizeHandles({ directions, widget_title, description_id, on_resize_start, on_resize_move, on_resize_end, on_resize_key }) {
  const resize_handlers = { on_resize_start, on_resize_move, on_resize_end };
  const corner_handlers = use_resize_drag('se', resize_handlers);

  function handle_key_down(key_event) {
    if (on_resize_key(key_event)) key_event.preventDefault();
  }

  return (
    <>
      {directions
        .filter((direction) => direction !== 'se')
        .map((direction) => (
          <ResizeZone key={direction} direction={direction} resize_handlers={resize_handlers} />
        ))}
      <button
        type="button"
        aria-describedby={description_id}
        onKeyDown={handle_key_down}
        {...corner_handlers}
        className={`absolute right-0.5 bottom-0.5 z-10 flex h-6 w-6 cursor-nwse-resize touch-none items-center justify-center rounded-md text-ink-muted hover:text-ink ${SHOW_ON_HOVER}`}
      >
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M10.5 3.5a7 7 0 0 1-7 7" />
        </svg>
        <span className="sr-only">Resize {widget_title}</span>
      </button>
    </>
  );
}

