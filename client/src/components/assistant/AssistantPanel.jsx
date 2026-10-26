import { Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { ASSISTANT_PANEL_ID } from '../../config/constants.js';
import { use_assistant } from '../../context/AssistantContext.jsx';
import { use_escape_key } from '../../hooks/use_escape_key.js';
import { find_stack_item, to_widget_item } from '../../utils/widget_layout.js';
import { get_button_classes } from '../button_styles.js';
import WidgetWindow from '../widgets/WidgetWindow.jsx';
import AssistantChat from './AssistantChat.jsx';

// The panel's two tabs.
export const PANEL_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'widgets', label: 'Widgets' },
];

// Every widget the assistant made, to open, pin, rename or delete (or take out of its stack).
function WidgetsTab() {
  const { widgets_state, stacks_state } = use_assistant();
  const widgets = widgets_state.data ?? [];
  const stacks = stacks_state.data ?? [];
  if (widgets.length === 0) {
    return (
      <p className="text-body text-ink">
        No widgets yet. Ask for one in the chat, like "make me a countdown to my exam on 12 December" or "build a unit
        converter for my physics homework".
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {widgets.map((widget) => (
        <WidgetWindow
          key={widget.id}
          item={to_widget_item(widget)}
          placement="panel"
          id_prefix="panel"
          stack_item={find_stack_item(stacks, widgets, widget.id)}
        />
      ))}
    </div>
  );
}

// The assistant's side panel (the whole screen on phones). It stays mounted once opened,
// so a half-typed message survives closing it; Escape or the X closes it.
function AssistantPanel() {
  const { is_open, close_assistant, widgets_state } = use_assistant();
  const [current_tab, set_current_tab] = useState('chat');
  use_escape_key(is_open, close_assistant);
  const widget_count = widgets_state.data?.length ?? 0;

  return (
    <div
      id={ASSISTANT_PANEL_ID}
      role="dialog"
      aria-modal="false"
      aria-labelledby="assistant-heading"
      hidden={!is_open}
      className="fixed inset-0 z-50 flex flex-col gap-3 border-border bg-surface p-4 shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[28rem] sm:border-l"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="assistant-heading" className="flex items-center gap-2 text-heading-3 font-bold text-ink">
          <Sparkles aria-hidden="true" className="h-5 w-5 text-brand-700" />
          Assistant
        </h2>
        <button type="button" onClick={close_assistant} className={get_button_classes('ghost', 'px-2 py-1')}>
          <X aria-hidden="true" className="h-5 w-5" />
          <span className="sr-only">Close the assistant</span>
        </button>
      </div>

      <div role="tablist" aria-label="Assistant" className="flex gap-1 border-b border-border">
        {PANEL_TABS.map((panel_tab) => {
          const is_current = panel_tab.id === current_tab;
          return (
            <button
              key={panel_tab.id}
              id={`assistant-tab-${panel_tab.id}`}
              type="button"
              role="tab"
              aria-selected={is_current}
              aria-controls={`assistant-tabpanel-${panel_tab.id}`}
              onClick={() => set_current_tab(panel_tab.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-small ${is_current ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {panel_tab.label}
              {panel_tab.id === 'widgets' && widget_count > 0 && ` (${widget_count})`}
            </button>
          );
        })}
      </div>

      <div
        id="assistant-tabpanel-chat"
        role="tabpanel"
        aria-labelledby="assistant-tab-chat"
        hidden={current_tab !== 'chat'}
        className="flex min-h-0 flex-1 flex-col"
      >
        <AssistantChat is_visible={is_open && current_tab === 'chat'} />
      </div>
      <div
        id="assistant-tabpanel-widgets"
        role="tabpanel"
        aria-labelledby="assistant-tab-widgets"
        hidden={current_tab !== 'widgets'}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <WidgetsTab />
      </div>
    </div>
  );
}

export default AssistantPanel;
