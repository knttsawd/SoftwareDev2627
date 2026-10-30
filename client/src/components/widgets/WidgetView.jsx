
import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_SAVE_DELAY_MS } from '../../config/constants.js';
import { use_theme } from '../../context/ThemeContext.jsx';
import {
  APP_HEIGHT_MESSAGE,
  APP_SAVE_MESSAGE,
  APP_SHAPE_MESSAGE,
  APP_STATE_MAX_LENGTH,
  build_app_document,
  clamp_widget_height,
} from '../../utils/widgets.js';
import WidgetBlock, { DEFAULT_SHAPE } from './WidgetBlocks.jsx';

// An app widget: the AI's html in a sandboxed frame (scripts only, no same-origin access,
// no network; see build_app_document) with the design kit in the current theme and the
// widget's accent, see-through so the widget's look shows behind it. The frame tells the
// page the widget's shape when it loads and whenever it changes, so the app can show its
// compact or large layout. The frame starts at the height the AI chose, then fits the page's
// content as it reports its height (only a number is taken from it, and only from this
// widget's own frame). A fixed_height the student set wins over both. The app's own data
// (kit.save) is kept in the widget's state as "app": saves from its own frame, within
// APP_STATE_MAX_LENGTH, are sent through on_state_change once they stop for
// APP_SAVE_DELAY_MS (or when the app closes). The page is built with the data saved when it
// opens, so a save never reloads it.
function AppWidget({ widget, fixed_height, shape, accent, on_state_change }) {
  const { theme } = use_theme();
  const frame_ref = useRef(null);
  const [height, set_height] = useState(widget.spec.height);
  const latest = useRef({});
  latest.current = { state: widget.state, on_state_change };
  const pending_save = useRef(null);
  const save_timer = useRef(null);

  const app_document = useMemo(
    () =>
      build_app_document(
        widget.spec.html,
        theme,
        accent,
        latest.current.state?.app ?? null,
      ),
    [widget.spec.html, theme, accent],
  );

  // Sends the waiting save, if there is one.
  function flush_save() {
    clearTimeout(save_timer.current);
    if (pending_save.current === null) return;
    const { state, on_state_change: save_state } = latest.current;
    save_state?.({ ...state, app: pending_save.current.data });
    pending_save.current = null;
  }

  useEffect(() => flush_save, []);

  // Sends the frame's page the widget's shape.
  function send_shape() {
    frame_ref.current?.contentWindow?.postMessage(
      {
        type: APP_SHAPE_MESSAGE,
        size: shape.size,
        orientation: shape.orientation,
      },
      '*',
    );
  }

  useEffect(send_shape, [shape.size, shape.orientation]);

  useEffect(() => {
    function handle_message(message_event) {
      if (message_event.source !== frame_ref.current?.contentWindow) return;

      if (message_event.data?.type === APP_SAVE_MESSAGE) {
        const saved_text = JSON.stringify(message_event.data.state ?? null);
        if (saved_text.length > APP_STATE_MAX_LENGTH) return;

        pending_save.current = { data: JSON.parse(saved_text) };
        clearTimeout(save_timer.current);
        save_timer.current = setTimeout(flush_save, APP_SAVE_DELAY_MS);
        return;
      }

      if (message_event.data?.type !== APP_HEIGHT_MESSAGE) return;

      const reported_height = clamp_widget_height(message_event.data.height);
      if (reported_height !== null) set_height(reported_height);
    }

    window.addEventListener('message', handle_message);
    return () => window.removeEventListener('message', handle_message);
  }, []);

  return (
    <div className="relative flex flex-col gap-2">
      <iframe
        ref={frame_ref}
        title={widget.title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={app_document}
        onLoad={send_shape}
        style={{ height: fixed_height ?? height }}
        className="w-full border-0 bg-transparent"
      />
    </div>
  );
}

// A widget's content: a card's blocks or an app. on_state_change(state) saves a card's
// ticks or an app's own data. The same widget can show in several places at once (above the
// page, in the panel, in the chat), so id_prefix keeps each copy's element ids apart.
// fixed_height (pixels, or null) is an app's height set by resizing it. shape ({ size,
// orientation }, see describe_shape) lets each block, or the app, lay itself out for the
// widget's size; with a set height (an orientation), the blocks can fill it. accent is the
// widget's accent, for an app's design kit.
function WidgetView({
  widget,
  id_prefix,
  fixed_height = null,
  shape = DEFAULT_SHAPE,
  accent,
  on_state_change,
}) {
  if (widget.kind === 'app') {
    return (
      <AppWidget
        widget={widget}
        fixed_height={fixed_height}
        shape={shape}
        accent={accent}
        on_state_change={on_state_change}
      />
    );
  }

  return (
    <div
      className={`flex flex-col gap-4 ${
        shape.orientation ? 'min-h-0 flex-1' : ''
      }`}
    >
      {widget.spec.blocks.map((block, block_index) => (
        <WidgetBlock
          key={`${widget.id}-${block_index}`}
          block={block}
          block_index={block_index}
          block_id={`${id_prefix}-${widget.id}-${block_index}`}
          state={widget.state}
          shape={shape}
          on_state_change={on_state_change}
        />
      ))}
    </div>
  );
}

export default WidgetView;
