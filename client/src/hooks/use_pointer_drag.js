import { useRef } from 'react';

// Pointer-drag handlers to spread onto an element, for a mouse, a pen or a finger alike:
//   on_start(event): when pressed; return false to leave this press alone
//   on_move(delta_x, delta_y, event): while moving, how far from where it was pressed
//   on_end(was_let_go, delta_x, delta_y): let go (true), or cancelled by the browser (false)
// The pointer is captured, so the drag carries on even when it leaves the element. While
// any drag is on, <body data-dragging> stops frames (app widgets) taking the pointer, so a
// drag over one isn't lost inside it, and stops text being selected (see theme.css).
export function use_pointer_drag({ on_start, on_move, on_end }) {
  const start_point = useRef(null);

  function finish(was_let_go, pointer_event) {
    if (!start_point.current) return;
    const { x, y } = start_point.current;
    start_point.current = null;
    delete document.body.dataset.dragging;
    on_end(was_let_go, (pointer_event.clientX ?? x) - x, (pointer_event.clientY ?? y) - y);
  }

  return {
    onPointerDown(pointer_event) {
      if (pointer_event.button > 0 || on_start(pointer_event) === false) return;
      pointer_event.preventDefault();
      pointer_event.currentTarget.setPointerCapture?.(pointer_event.pointerId);
      start_point.current = { x: pointer_event.clientX, y: pointer_event.clientY };
      document.body.dataset.dragging = 'true';
    },
    onPointerMove(pointer_event) {
      if (!start_point.current) return;
      on_move(pointer_event.clientX - start_point.current.x, pointer_event.clientY - start_point.current.y, pointer_event);
    },
    onPointerUp: (pointer_event) => finish(true, pointer_event),
    onPointerCancel: (pointer_event) => finish(false, pointer_event),
  };
}
