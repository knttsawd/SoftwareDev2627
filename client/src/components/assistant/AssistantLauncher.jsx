import { Sparkles } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ASSISTANT_PANEL_ID, ASSISTANT_SHORTCUT_KEY } from '../../config/constants.js';
import { use_assistant } from '../../context/AssistantContext.jsx';

// The panel (with the Markdown and widget code it needs) downloads the first time it opens.
const AssistantPanel = lazy(() => import('./AssistantPanel.jsx'));

// True for Ctrl+K (Cmd+K on a Mac), the shortcut that opens and closes the assistant.
export function is_assistant_shortcut(keyboard_event) {
  return (keyboard_event.ctrlKey || keyboard_event.metaKey) && keyboard_event.key.toLowerCase() === ASSISTANT_SHORTCUT_KEY;
}

// The round "Assistant" button in the corner of every dashboard page, and the panel it
// opens. Ctrl+K (Cmd+K) opens or closes it from anywhere on the page. The panel is only
// built the first time it's opened, so pages that never use it don't load the
// conversation. When the panel closes, focus comes back to the button.
function AssistantLauncher() {
  const { is_open, open_assistant, close_assistant } = use_assistant();
  const [has_opened, set_has_opened] = useState(false);
  const button_ref = useRef(null);
  const was_open = useRef(false);

  useEffect(() => {
    if (is_open) set_has_opened(true);
    if (was_open.current && !is_open) button_ref.current?.focus();
    was_open.current = is_open;
  }, [is_open]);

  useEffect(() => {
    function handle_key_down(keyboard_event) {
      if (!is_assistant_shortcut(keyboard_event)) return;
      keyboard_event.preventDefault();
      if (is_open) close_assistant();
      else open_assistant();
    }
    document.addEventListener('keydown', handle_key_down);
    return () => document.removeEventListener('keydown', handle_key_down);
  }, [is_open, open_assistant, close_assistant]);

  return (
    <>
      <button
        ref={button_ref}
        type="button"
        onClick={() => open_assistant()}
        aria-expanded={is_open}
        aria-controls={has_opened ? ASSISTANT_PANEL_ID : undefined}
        aria-keyshortcuts="Control+K Meta+K"
        hidden={is_open}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 font-semibold text-white shadow-lg hover:bg-brand-deep"
      >
        <Sparkles aria-hidden="true" className="h-5 w-5" />
        Assistant
        <kbd aria-hidden="true" className="hidden rounded border border-white/40 px-1.5 text-caption font-medium lg:inline">
          Ctrl K
        </kbd>
      </button>
      {has_opened && (
        <Suspense fallback={null}>
          <AssistantPanel />
        </Suspense>
      )}
    </>
  );
}

export default AssistantLauncher;
