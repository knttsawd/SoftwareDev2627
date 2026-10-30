import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_LONG_WAIT_MS } from '../src/config/constants.js';
import { render_in_router, render_with_routes } from './helpers/render_helpers.jsx';

vi.mock('../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue('response') }));
vi.mock('../src/services/widget_service.js', () => ({
  fetch_widgets: vi.fn(),
  fetch_widget_stacks: vi.fn(),
  update_widget: vi.fn(),
  delete_widget: vi.fn(),
  fetch_live_widget_data: vi.fn(),
}));
vi.mock('../src/services/learning_service.js', () => ({ fetch_glossary: vi.fn().mockResolvedValue([]), explain_another_way: vi.fn() }));
vi.mock('../src/services/assistant_service.js', async (import_original) => ({
  ...(await import_original()),
  fetch_assistant: vi.fn(),
  send_assistant_message: vi.fn(),
  clear_assistant: vi.fn(),
  choose_assistant: vi.fn(),
  confirm_assistant_action: vi.fn(),
  cancel_assistant_action: vi.fn(),
}));

const { send_authed_request } = await import('../src/services/auth_service.js');
const { fetch_widget_stacks, fetch_widgets } = await import('../src/services/widget_service.js');
const assistant_service = await import('../src/services/assistant_service.js');
const { DATA_CHANGED_EVENT, notify_data_changed } = await import('../src/utils/data_events.js');
const { use_api_data } = await import('../src/hooks/use_api_data.js');
const { AssistantProvider, use_assistant } = await import('../src/context/AssistantContext.jsx');
const { ACTION_STATUS_DETAILS } = await import('../src/components/assistant/AssistantActions.jsx');
const { add_exchange, replace_message, STARTER_REQUESTS } = await import('../src/components/assistant/AssistantChat.jsx');
const { PANEL_TABS } = await import('../src/components/assistant/AssistantPanel.jsx');
const { is_assistant_shortcut, default: AssistantLauncher } = await import('../src/components/assistant/AssistantLauncher.jsx');
const { default: MarkdownContent } = await import('../src/components/MarkdownContent.jsx');

const OPTIONS = [
  { id: 'quick', label: 'Quick', description: 'Fast and cheap.' },
  { id: 'practice', label: 'Practice mode', description: 'Works offline.' },
];
const USER_MESSAGE = { id: 'u1', role: 'user', content: 'Make a quiz', actions: [], created_at: 'now' };
const REPLY = {
  id: 'a1',
  role: 'assistant',
  content: 'Made **a quiz**.',
  created_at: 'now',
  actions: [
    { id: 'x1', tool: 'make_quiz', label: 'Make a quiz on "Cells"', status: 'done', summary: 'Made it.', link: '/dashboard/quiz?quiz=q1', widget_id: null },
    { id: 'x2', tool: 'delete_skill', label: 'Delete the skill "Art"', status: 'pending', summary: 'Waiting for you to confirm', link: null, widget_id: null },
    { id: 'x3', tool: 'add_topic', label: 'Add the topic "X"', status: 'failed', summary: 'Topic is required', link: null, widget_id: null },
    { id: 'x4', tool: 'create_widget', label: 'Make the widget "List"', status: 'done', summary: 'Made it.', link: null, widget_id: 'w1' },
  ],
};
const WIDGET = {
  id: 'w1',
  title: 'List',
  kind: 'card',
  spec: { blocks: [{ type: 'checklist', items: ['Read'] }] },
  state: {},
  pinned_paths: [],
  layout: { width: 'small', height: null, is_collapsed: false, position: null, mode: 'docked', anchor: 'screen', x: null, y: null, float_width: null, float_height: null, appearance: 'solid', accent: 'indigo' },
};

// Shows the assistant from a dashboard-like page: the launcher, plus a button that opens it
// with a question (as "Ask the assistant" does), and where the router went.
function OpenWithQuestion() {
  const { open_assistant } = use_assistant();
  return (
    <button type="button" onClick={() => open_assistant('Explain cells')}>
      Ask about cells
    </button>
  );
}

function render_assistant(initial_path = '/dashboard/skill-map?skill=s1') {
  return render_with_routes(
    [
      {
        path: '*',
        element: (
          <AssistantProvider>
            <OpenWithQuestion />
            <AssistantLauncher />
          </AssistantProvider>
        ),
      },
    ],
    { initial_path },
  );
}

async function open_panel() {
  await userEvent.click(screen.getByRole('button', { name: 'Assistant' }));
  return screen.findByLabelText('Ask or tell the assistant');
}

beforeEach(() => {
  vi.clearAllMocks();
  fetch_widgets.mockResolvedValue([WIDGET]);
  fetch_widget_stacks.mockResolvedValue([]);
  assistant_service.fetch_assistant.mockResolvedValue({ messages: [], assistant_id: 'quick', assistants: OPTIONS });
});

describe('assistant service', () => {
  it('calls the assistant endpoints with the page and time zone', async () => {
    const real_service = await vi.importActual('../src/services/assistant_service.js');
    expect(real_service.get_utc_offset_minutes({ getTimezoneOffset: () => -60 })).toBe(60);
    await real_service.fetch_assistant();
    expect(send_authed_request).toHaveBeenLastCalledWith('/assistant');
    await real_service.send_assistant_message('Hi', '/dashboard/learn');
    expect(send_authed_request).toHaveBeenLastCalledWith('/assistant/messages', {
      method: 'POST',
      body: { message: 'Hi', page: '/dashboard/learn', utc_offset_minutes: real_service.get_utc_offset_minutes() },
    });
    await real_service.clear_assistant();
    expect(send_authed_request).toHaveBeenLastCalledWith('/assistant/messages', { method: 'DELETE' });
    await real_service.choose_assistant('practice');
    expect(send_authed_request).toHaveBeenLastCalledWith('/assistant/settings', { method: 'PUT', body: { assistant_id: 'practice' } });
    await real_service.confirm_assistant_action('a1', 'x2');
    expect(send_authed_request).toHaveBeenLastCalledWith('/assistant/messages/a1/actions/x2/confirm', { method: 'POST' });
    await real_service.cancel_assistant_action('a1', 'x2');
    expect(send_authed_request).toHaveBeenLastCalledWith('/assistant/messages/a1/actions/x2/cancel', { method: 'POST' });
  });
});

describe('data changes', () => {
  it('make everything loaded with use_api_data load again', async () => {
    const load_data = vi.fn().mockResolvedValue('data');
    renderHook(() => use_api_data(load_data, []));
    await waitFor(() => expect(load_data).toHaveBeenCalledTimes(1));
    act(() => notify_data_changed());
    await waitFor(() => expect(load_data).toHaveBeenCalledTimes(2));

    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener(DATA_CHANGED_EVENT, listener);
    notify_data_changed(target);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('assistant context and helpers', () => {
  it('is null outside a dashboard page', () => {
    const { result } = renderHook(() => use_assistant());
    expect(result.current).toBeNull();
  });

  it('adds and replaces messages, and lists statuses, starters and tabs', () => {
    const assistant = { assistant_id: 'quick', messages: [USER_MESSAGE] };
    expect(add_exchange(assistant, { user_message: USER_MESSAGE, assistant_message: REPLY }).messages).toHaveLength(3);
    expect(replace_message({ messages: [USER_MESSAGE, REPLY] }, { ...REPLY, content: 'New' }).messages[1].content).toBe('New');
    expect(Object.keys(ACTION_STATUS_DETAILS)).toEqual(['done', 'failed', 'pending', 'cancelled']);
    expect(STARTER_REQUESTS.length).toBeGreaterThan(2);
    expect(PANEL_TABS.map((panel_tab) => panel_tab.label)).toEqual(['Chat', 'Widgets']);
  });

  it('opens app links in place and other links in a new tab', () => {
    render_in_router(<MarkdownContent markdown_text="[Quiz](/dashboard/quiz?quiz=q1) and [site](https://example.com)" />);
    expect(screen.getByRole('link', { name: 'Quiz' })).not.toHaveAttribute('target');
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('target', '_blank');
  });
});

describe('the assistant panel', () => {
  it('opens from the corner button, focuses the message box, and returns focus when closed', async () => {
    render_assistant();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const composer = await open_panel();
    await waitFor(() => expect(composer).toHaveFocus());
    expect(screen.getByRole('dialog', { name: 'Assistant' })).toBeVisible();
    expect(screen.getByLabelText('AI')).toHaveValue('quick');
    expect(screen.getByLabelText('AI')).toHaveAccessibleDescription('Fast and cheap.');

    await userEvent.click(screen.getByRole('button', { name: 'Close the assistant' }));
    expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Assistant' })).toHaveFocus();
  });

  it('opens and closes with Ctrl+K or Cmd+K from anywhere on the page', async () => {
    render_assistant();
    expect(is_assistant_shortcut({ ctrlKey: true, metaKey: false, key: 'K' })).toBe(true);
    expect(is_assistant_shortcut({ ctrlKey: false, metaKey: true, key: 'k' })).toBe(true);
    expect(is_assistant_shortcut({ ctrlKey: false, metaKey: false, key: 'k' })).toBe(false);

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Assistant' })).toBeVisible();
    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible();
    await userEvent.keyboard('k');
    expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible();
  });

  it('closes with Escape, keeping what was typed', async () => {
    render_assistant();
    await userEvent.type(await open_panel(), 'half a thought');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Assistant' }));
    expect(screen.getByLabelText('Ask or tell the assistant')).toHaveValue('half a thought');
  });

  it('opens with a question typed in from elsewhere on the page', async () => {
    render_assistant();
    await userEvent.click(screen.getByRole('button', { name: 'Ask about cells' }));
    expect(await screen.findByLabelText('Ask or tell the assistant')).toHaveValue('Explain cells');
  });

  it('says bigger jobs take longer when a reply is slow', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    assistant_service.send_assistant_message.mockReturnValue(new Promise(() => {}));
    render_assistant();
    await open_panel();
    await userEvent.click(screen.getByRole('button', { name: STARTER_REQUESTS[1] }));
    expect(screen.getByText('Working on it…')).toHaveAttribute('role', 'status');
    act(() => vi.advanceTimersByTime(ASSISTANT_LONG_WAIT_MS));
    expect(screen.getByText(/Bigger jobs, like building an app, can take a minute or two/)).toHaveAttribute('role', 'status');
    vi.useRealTimers();
  });

  it('sends a starter request, shows the reply and what was done, and opens pages', async () => {
    let finish_sending;
    assistant_service.send_assistant_message.mockReturnValue(new Promise((resolve) => (finish_sending = resolve)));
    const { router } = render_assistant();
    await open_panel();

    await userEvent.click(screen.getByRole('button', { name: STARTER_REQUESTS[1] }));
    expect(assistant_service.send_assistant_message).toHaveBeenCalledWith(STARTER_REQUESTS[1], '/dashboard/skill-map?skill=s1');
    expect(screen.getByText('Working on it…')).toBeInTheDocument();
    // A later refresh finds the exchange on the server too.
    assistant_service.fetch_assistant.mockResolvedValue({ messages: [USER_MESSAGE, REPLY], assistant_id: 'quick', assistants: OPTIONS });
    await act(async () =>
      finish_sending({ user_message: USER_MESSAGE, assistant_message: REPLY, client_actions: [{ type: 'navigate', path: '/dashboard/quiz?quiz=q1' }], data_changed: true }),
    );

    const conversation = screen.getByRole('log', { name: 'Conversation with the assistant' });
    expect(within(conversation).getByText('a quiz').tagName).toBe('STRONG');
    const actions = within(conversation).getByRole('list', { name: 'What the assistant did' });
    expect(within(actions).getAllByText('Done:')[0]).toHaveClass('sr-only');
    expect(within(actions).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/dashboard/quiz?quiz=q1');
    expect(within(actions).getByText('Topic is required')).toBeInTheDocument();
    expect(within(actions).getByRole('group', { name: 'List' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard/quiz');
  });

  it('puts the message back when sending fails', async () => {
    assistant_service.send_assistant_message.mockRejectedValue(new Error('The AI is busy right now'));
    render_assistant();
    const composer = await open_panel();
    await userEvent.type(composer, 'Hello{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now');
    expect(composer).toHaveValue('Hello');
  });

  it('confirms and cancels actions that wait for the student', async () => {
    assistant_service.fetch_assistant.mockResolvedValue({ messages: [USER_MESSAGE, REPLY], assistant_id: 'quick', assistants: OPTIONS });
    const confirmed_reply = { ...REPLY, actions: REPLY.actions.map((action) => (action.id === 'x2' ? { ...action, status: 'done', summary: 'Deleted.' } : action)) };
    assistant_service.confirm_assistant_action.mockResolvedValue({ message: confirmed_reply, client_actions: [], data_changed: true });
    assistant_service.cancel_assistant_action.mockRejectedValue(new Error('Already cancelled'));
    render_assistant();
    await open_panel();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(assistant_service.cancel_assistant_action).toHaveBeenCalledWith('a1', 'x2');
    expect(await screen.findByRole('alert')).toHaveTextContent('Already cancelled');
    assistant_service.fetch_assistant.mockResolvedValue({ messages: [USER_MESSAGE, confirmed_reply], assistant_id: 'quick', assistants: OPTIONS });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(assistant_service.confirm_assistant_action).toHaveBeenCalledWith('a1', 'x2');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument());
  });

  it('applies a cancel that succeeds', async () => {
    assistant_service.fetch_assistant.mockResolvedValue({ messages: [USER_MESSAGE, REPLY], assistant_id: 'quick', assistants: OPTIONS });
    const cancelled_reply = { ...REPLY, actions: REPLY.actions.map((action) => (action.id === 'x2' ? { ...action, status: 'cancelled', summary: 'Cancelled' } : action)) };
    assistant_service.cancel_assistant_action.mockResolvedValue({ message: cancelled_reply });
    render_assistant();
    await open_panel();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
  });

  it('changes the AI, undoing the choice if saving fails, and clears the conversation', async () => {
    assistant_service.fetch_assistant.mockResolvedValue({ messages: [USER_MESSAGE, REPLY], assistant_id: 'quick', assistants: OPTIONS });
    assistant_service.choose_assistant.mockResolvedValueOnce({ assistant_id: 'practice' }).mockRejectedValueOnce(new Error('Offline'));
    assistant_service.clear_assistant.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Could not clear'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render_assistant();
    await open_panel();

    await userEvent.selectOptions(screen.getByLabelText('AI'), 'practice');
    expect(assistant_service.choose_assistant).toHaveBeenCalledWith('practice');
    expect(screen.getByLabelText('AI')).toHaveAccessibleDescription('Works offline.');
    await userEvent.selectOptions(screen.getByLabelText('AI'), 'quick');
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(screen.getByLabelText('AI')).toHaveValue('practice');

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByRole('button', { name: STARTER_REQUESTS[0] })).toBeInTheDocument();
  });

  it('shows a failed clear, and a conversation that cannot load', async () => {
    assistant_service.fetch_assistant.mockResolvedValueOnce({ messages: [USER_MESSAGE, REPLY], assistant_id: 'quick', assistants: OPTIONS });
    assistant_service.clear_assistant.mockRejectedValue(new Error('Could not clear'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const first = render_assistant();
    await open_panel();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not clear');
    first.unmount();

    assistant_service.fetch_assistant.mockRejectedValue(new Error('Offline'));
    render_assistant();
    await userEvent.click(screen.getByRole('button', { name: 'Assistant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  });

  it('lists every widget in the Widgets tab', async () => {
    render_assistant();
    await open_panel();
    await userEvent.click(screen.getByRole('tab', { name: 'Widgets (1)' }));
    expect(screen.getByRole('tab', { name: 'Widgets (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel', { name: 'Widgets (1)' })).getByRole('group', { name: 'List' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.getByRole('tabpanel', { name: 'Chat' })).toBeVisible();
  });

  it('suggests asking for a widget when there are none', async () => {
    fetch_widgets.mockResolvedValue([]);
    render_assistant();
    await open_panel();
    await userEvent.click(screen.getByRole('tab', { name: 'Widgets' }));
    expect(screen.getByText(/No widgets yet/)).toBeInTheDocument();
  });
});

describe('TopicDetails on a dashboard page', () => {
  it('opens the assistant with a question about the topic', async () => {
    const { default: TopicDetails } = await import('../src/components/topic_map/TopicDetails.jsx');
    const topic = { id: 't1', topic: 'Cells', parent_node_id: null, summary: '', mastery_score: null, mastery_level: 'untested' };
    let opened_with = null;
    function Spy() {
      const assistant = use_assistant();
      useEffect(() => {
        if (assistant.draft_request) opened_with = assistant.draft_request.draft;
      }, [assistant.draft_request]);
      return null;
    }
    render_in_router(
      <AssistantProvider>
        <Spy />
        <TopicDetails skill={{ id: 's1', name: 'Biology' }} topic={topic} topics={[topic]} resources={[]} />
      </AssistantProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ask the assistant' }));
    expect(opened_with).toBe('Help me understand Cells in Biology.');
  });
});
