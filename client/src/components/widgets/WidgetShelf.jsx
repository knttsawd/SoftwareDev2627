import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { lazy, Suspense, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { SHELF_COLUMNS, SHELF_GRID_QUERY } from '../../config/constants.js';
import { use_assistant } from '../../context/AssistantContext.jsx';
import { use_media_query } from '../../hooks/use_media_query.js';
import { use_widget_actions } from '../../hooks/use_widget_actions.js';
import { build_layout_items, drop_beside, find_drop_side, get_item_title, move_by, split_page_items } from '../../utils/widget_layout.js';
import AlertMessage from '../AlertMessage.jsx';
import { get_button_classes } from '../button_styles.js';

// Widgets download only on pages that have some.
const WidgetWindow = lazy(() => import('./WidgetWindow.jsx'));

const TOOLBAR_BUTTON = 'px-2 py-1 text-small';

// What the move grip and the resize corner do, for screen readers.
export function WidgetDescriptions({ description_ids }) {
  return (
    <>
      <p id={description_ids.move} className="sr-only">
        Drag the title bar to move it, or use the arrow keys here.
      </p>
      <p id={description_ids.resize} className="sr-only">
        Drag an edge to resize it, or use the arrow keys here: left and right change the width, up and down the height.
      </p>
    </>
  );
}

// The docked widgets and stacks on this page (or every page), in a grid above the page's
// own content that the student arranges: drag an item by its title bar (or move it with
// its grip's arrow keys) to reorder, drop it on the middle of another to stack the two,
// resize it from its edges, fold items away one at a time or all at once. Every change is
// saved, shown at once, and undone if saving fails; moves are announced to screen readers.
// Nothing shows when no item is docked here. media_window is injectable for tests.
function WidgetShelf({ media_window }) {
  const { widgets_state, stacks_state, announce } = use_assistant();
  const actions = use_widget_actions();
  const { pathname } = useLocation();
  const has_columns = use_media_query(SHELF_GRID_QUERY, media_window);
  const shelf_ref = useRef(null);
  const [drag, set_drag] = useState(null);
  const [shelf_error, set_shelf_error] = useState('');
  const description_id = useId();
  const description_ids = { move: `${description_id}-move`, resize: `${description_id}-resize` };

  const items = build_layout_items(widgets_state.data ?? [], stacks_state.data ?? []);
  const { docked: docked_items, floating: floating_items } = split_page_items(items, pathname, has_columns);
  if (docked_items.length === 0) return null;
  const keys = docked_items.map((item) => item.key);
  const collapsed_count = docked_items.filter((item) => item.layout.is_collapsed).length;

  // Saves through use_widget_actions, showing what went wrong if it fails.
  async function run(saving) {
    set_shelf_error('');
    const error_message = await saving;
    if (error_message) set_shelf_error(error_message);
  }

  // Shows the new order at once, says where the item went, and saves it.
  function save_order(ordered_keys, moved_item) {
    announce(`${get_item_title(moved_item)} moved to place ${ordered_keys.indexOf(moved_item.key) + 1} of ${ordered_keys.length}.`);
    run(actions.save_order(ordered_keys.map((key) => docked_items.find((item) => item.key === key))));
  }

  // Moves an item by offset places (from its grip's arrow keys or its menu).
  function move_item(item, offset) {
    const ordered_keys = move_by(keys, item.key, offset);
    if (ordered_keys.indexOf(item.key) !== keys.indexOf(item.key)) save_order(ordered_keys, item);
  }

  // While an item is dragged: the item under the pointer (not the one being dragged), and
  // which part of it.
  function track_drag(pointer_x, pointer_y) {
    const target_element = (document.elementsFromPoint?.(pointer_x, pointer_y) ?? [])
      .map((element) => element.closest('[data-item-key]'))
      .find((element) => element && shelf_ref.current.contains(element) && element.dataset.itemKey !== drag.key);
    if (!target_element) {
      set_drag({ ...drag, target_key: null, side: null });
      return;
    }
    const side = find_drop_side(target_element.getBoundingClientRect(), shelf_ref.current.offsetWidth, pointer_x, pointer_y);
    set_drag({ ...drag, target_key: target_element.dataset.itemKey, side });
  }

  // When let go over another item: in its middle, the two are stacked; at a side, the
  // dragged item goes beside it.
  function finish_drag(was_let_go) {
    if (was_let_go && drag?.target_key) {
      const dragged_item = docked_items.find((item) => item.key === drag.key);
      const target_item = docked_items.find((item) => item.key === drag.target_key);
      if (drag.side === 'center') {
        announce(`Stacked ${get_item_title(dragged_item)} with ${get_item_title(target_item)}.`);
        run(actions.stack_together(target_item, dragged_item));
      } else {
        save_order(drop_beside(keys, drag.key, drag.target_key, drag.side), dragged_item);
      }
    }
    set_drag(null);
  }

  // Folds every docked item here away (true) or opens them all (false).
  function set_all_collapsed(is_collapsed) {
    for (const item of docked_items) {
      if (item.layout.is_collapsed !== is_collapsed) run(actions.save_layout(item, { is_collapsed }));
    }
  }

  // One column's width in pixels for resizing, or null on narrow screens (one item a row).
  function get_column_width() {
    return has_columns ? shelf_ref.current.offsetWidth / SHELF_COLUMNS : null;
  }

  const page_items = [...docked_items, ...floating_items];
  return (
    <section aria-label="Your pinned widgets" className="mb-6 flex flex-col gap-2">
      {docked_items.length > 1 && (
        <div className="flex justify-end gap-1">
          <button type="button" disabled={collapsed_count === docked_items.length} onClick={() => set_all_collapsed(true)} className={get_button_classes('ghost', TOOLBAR_BUTTON)}>
            <ChevronsDownUp aria-hidden="true" className="h-4 w-4" />
            Collapse all
          </button>
          <button type="button" disabled={collapsed_count === 0} onClick={() => set_all_collapsed(false)} className={get_button_classes('ghost', TOOLBAR_BUTTON)}>
            <ChevronsUpDown aria-hidden="true" className="h-4 w-4" />
            Expand all
          </button>
        </div>
      )}
      {shelf_error && <AlertMessage>{shelf_error}</AlertMessage>}
      <WidgetDescriptions description_ids={description_ids} />
      <div ref={shelf_ref} className="grid items-start gap-4 md:grid-cols-6">
        <Suspense fallback={null}>
          {docked_items.map((item, item_index) => (
            <WidgetWindow
              key={item.key}
              item={item}
              placement="docked"
              id_prefix="shelf"
              page={{ description_ids, can_float: has_columns, other_items: page_items.filter((other) => other.key !== item.key) }}
              docked={{
                index: item_index,
                count: docked_items.length,
                drop_side: drag?.target_key === item.key ? drag.side : null,
                get_column_width,
                on_move: (offset) => move_item(item, offset),
                on_drag_start: () => set_drag({ key: item.key, target_key: null, side: null }),
                on_drag_move: track_drag,
                on_drag_end: finish_drag,
              }}
            />
          ))}
        </Suspense>
      </div>
    </section>
  );
}

export default WidgetShelf;
