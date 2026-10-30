import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { use_api_data } from '../hooks/use_api_data.js';
import { fetch_widget_stacks, fetch_widgets } from '../services/widget_service.js';

// The assistant panel's open state and the student's widgets and smart stacks, shared by
// everything on a dashboard page: the launcher button, the panel, the widgets docked above
// the page or floating over it, and buttons elsewhere that open the assistant with a
// question ready ("Ask the assistant"). announce(text) says a change aloud to screen readers
// (a widget moved or resized), through one live region for the whole page.

export const AssistantContext = createContext(null);

export function AssistantProvider({ children }) {
  const [is_open, set_is_open] = useState(false);
  const [draft_request, set_draft_request] = useState(null);
  const [announcement, set_announcement] = useState('');
  const widgets_state = use_api_data(fetch_widgets, []);
  const stacks_state = use_api_data(fetch_widget_stacks, []);

  // Opens the panel. draft (optional) is typed into the message box, ready to send or edit;
  // each request gets its own id so the same question can be asked twice.
  const open_assistant = useCallback((draft = '') => {
    set_draft_request(draft ? { id: Date.now(), draft } : null);
    set_is_open(true);
  }, []);
  const close_assistant = useCallback(() => set_is_open(false), []);

  const value = useMemo(
    () => ({ is_open, open_assistant, close_assistant, draft_request, widgets_state, stacks_state, announce: set_announcement }),
    [is_open, open_assistant, close_assistant, draft_request, widgets_state, stacks_state],
  );
  return (
    <AssistantContext.Provider value={value}>
      {children}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </AssistantContext.Provider>
  );
}

// The assistant's context, or null outside a dashboard page (components that offer
// "Ask the assistant" hide that button then).
export function use_assistant() {
  return useContext(AssistantContext);
}
