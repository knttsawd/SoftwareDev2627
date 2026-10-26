import { lazy, Suspense, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { SHELF_GRID_QUERY } from '../../config/constants.js';
import { use_assistant } from '../../context/AssistantContext.jsx';
import { use_media_query } from '../../hooks/use_media_query.js';
import { use_viewport_size } from '../../hooks/use_viewport_size.js';
import { build_layout_items, split_page_items } from '../../utils/widget_layout.js';
import { WidgetDescriptions } from './WidgetShelf.jsx';

// Widgets download only on pages that have some.
const WidgetWindow = lazy(() => import('./WidgetWindow.jsx'));

// The floating widgets and stacks on this page: windows above the page's content. Each
// stays where it was put, either on the page (it scrolls with the page, placed within this
// layer, which covers the page's column) or on screen (it stays in view, placed within the
// window beside the sidebar, so it never slides under it). The one touched last comes to the front. On narrow screens there's no room to
// float, so WidgetShelf shows them docked instead. The layer itself lets clicks through to
// the page. Windows never touched sit at z-index 1; touching one puts it above the rest.
// media_window and viewport_window are injectable for tests.
function FloatingWidgets({ media_window, viewport_window }) {
  const { widgets_state, stacks_state } = use_assistant();
  const { pathname } = useLocation();
  const can_float = use_media_query(SHELF_GRID_QUERY, media_window);
  const viewport = use_viewport_size(viewport_window);
  const layer_ref = useRef(null);
  const [front_keys, set_front_keys] = useState([]);
  const description_id = useId();
  const description_ids = { move: `${description_id}-move`, resize: `${description_id}-resize` };

  const items = build_layout_items(widgets_state.data ?? [], stacks_state.data ?? []);
  const { docked: docked_items, floating: floating_items } = split_page_items(items, pathname, can_float);
  if (floating_items.length === 0) return null;
  const page_items = [...docked_items, ...floating_items];

  // The space a window is kept within: the screen right of the sidebar (where <main>
  // starts), or this layer (the page's column).
  function get_bounds(anchor) {
    if (anchor === 'screen' || !layer_ref.current) {
      const main_left = layer_ref.current?.closest('main')?.getBoundingClientRect().left ?? 0;
      return { left: main_left, top: 0, width: viewport.width - main_left, height: viewport.height };
    }
    return { width: layer_ref.current.offsetWidth, height: layer_ref.current.offsetHeight };
  }

  function bring_to_front(key) {
    set_front_keys((current_keys) => (current_keys.at(-1) === key ? current_keys : [...current_keys.filter((other_key) => other_key !== key), key]));
  }

  return (
    <div ref={layer_ref} className="pointer-events-none absolute inset-0 z-30">
      <WidgetDescriptions description_ids={description_ids} />
      <Suspense fallback={null}>
        {floating_items.map((item, item_index) => (
          <WidgetWindow
            key={item.key}
            item={item}
            placement="floating"
            id_prefix="float"
            page={{ description_ids, can_float: true, other_items: page_items.filter((other) => other.key !== item.key) }}
            floating={{
              z_index: 2 + front_keys.indexOf(item.key),
              cascade_index: item_index,
              get_bounds: () => get_bounds(item.layout.anchor),
              on_focus: () => bring_to_front(item.key),
            }}
          />
        ))}
      </Suspense>
    </div>
  );
}

export default FloatingWidgets;
