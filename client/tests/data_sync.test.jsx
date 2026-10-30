import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_CHANGE_DELAY_MS, RETURN_REFRESH_AFTER_MS } from '../src/config/constants.js';

// A stand-in for the channel between tabs: it records what this tab sends, and tests
// deliver messages from "other tabs" with dispatchEvent.
const sent_messages = [];
class FakeBroadcastChannel extends EventTarget {
  postMessage(message) {
    sent_messages.push(message);
  }
}
vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
vi.mock('../src/services/api_client.js', () => ({ api_request: vi.fn() }));

const { api_request } = await import('../src/services/api_client.js');
const { save_session_token, read_session_token } = await import('../src/services/session_store.js');
const { send_authed_request } = await import('../src/services/auth_service.js');
const { use_api_data } = await import('../src/hooks/use_api_data.js');
const data_events = await import('../src/utils/data_events.js');
const { DATA_CHANGED_EVENT, SESSION_ENDED_EVENT } = data_events;

let changed_listener;
let visibility_state = 'visible';

// Pretends the student switched tabs (hidden) or came back (visible).
function set_visibility(state) {
  visibility_state = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  sent_messages.length = 0;
  changed_listener = vi.fn();
  window.addEventListener(DATA_CHANGED_EVENT, changed_listener);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility_state });
});

afterEach(() => {
  window.removeEventListener(DATA_CHANGED_EVENT, changed_listener);
  vi.useRealTimers();
});

describe('announcing saves', () => {
  it('turns several quick saves into one reload here and one message to other tabs', () => {
    vi.useFakeTimers();
    data_events.announce_data_change();
    data_events.announce_data_change();
    expect(changed_listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DATA_CHANGE_DELAY_MS);
    expect(changed_listener).toHaveBeenCalledOnce();
    expect(sent_messages).toEqual([DATA_CHANGED_EVENT]);
  });

  it('announces a save after any request that changes something, but not after reading', async () => {
    vi.useFakeTimers();
    api_request.mockResolvedValue({ id: 'q1' });
    await send_authed_request('/skills');
    vi.advanceTimersByTime(DATA_CHANGE_DELAY_MS);
    expect(changed_listener).not.toHaveBeenCalled();

    await send_authed_request('/skills', { method: 'POST', body: { name: 'Art' } });
    vi.advanceTimersByTime(DATA_CHANGE_DELAY_MS);
    expect(changed_listener).toHaveBeenCalledOnce();
  });

  it('signs the app out when the server stops accepting the login', async () => {
    const ended_listener = vi.fn();
    window.addEventListener(SESSION_ENDED_EVENT, ended_listener);
    save_session_token('old-token');
    api_request.mockRejectedValue(Object.assign(new Error('Please log in'), { status: 401 }));

    await expect(send_authed_request('/skills')).rejects.toThrow('Please log in');
    expect(read_session_token()).toBeNull();
    expect(ended_listener).toHaveBeenCalledOnce();
    window.removeEventListener(SESSION_ENDED_EVENT, ended_listener);
  });
});

describe('start_data_sync', () => {
  it('reloads for saves in other tabs, and after time away from the tab', () => {
    let now = 1_000;
    const stop = data_events.start_data_sync(() => now);

    data_events.get_sync_channel().dispatchEvent(new MessageEvent('message', { data: DATA_CHANGED_EVENT }));
    data_events.get_sync_channel().dispatchEvent(new MessageEvent('message', { data: 'something else' }));
    expect(changed_listener).toHaveBeenCalledOnce();

    set_visibility('hidden');
    now += RETURN_REFRESH_AFTER_MS - 1;
    set_visibility('visible');
    expect(changed_listener).toHaveBeenCalledOnce();

    set_visibility('hidden');
    now += RETURN_REFRESH_AFTER_MS;
    set_visibility('visible');
    expect(changed_listener).toHaveBeenCalledTimes(2);

    stop();
    data_events.get_sync_channel().dispatchEvent(new MessageEvent('message', { data: DATA_CHANGED_EVENT }));
    expect(changed_listener).toHaveBeenCalledTimes(2);
  });
});

describe('use_api_data refreshes', () => {
  it('refreshes quietly: what is shown stays put, and a failed refresh keeps it', async () => {
    const load_data = vi.fn().mockResolvedValueOnce(['first']);
    const { result } = renderHook(() => use_api_data(load_data, []));
    await waitFor(() => expect(result.current.data).toEqual(['first']));

    let finish_refresh;
    load_data.mockReturnValueOnce(new Promise((resolve) => (finish_refresh = resolve)));
    act(() => data_events.notify_data_changed());
    expect(result.current).toMatchObject({ data: ['first'], is_loading: false });
    await act(async () => finish_refresh(['second']));
    expect(result.current.data).toEqual(['second']);

    load_data.mockRejectedValueOnce(new Error('Offline'));
    act(() => data_events.notify_data_changed());
    await waitFor(() => expect(load_data).toHaveBeenCalledTimes(3));
    expect(result.current).toMatchObject({ data: ['second'], error: '' });
  });

  it('leaves an activity in progress alone when live is false', async () => {
    const load_data = vi.fn().mockResolvedValue('lesson');
    renderHook(() => use_api_data(load_data, [], { live: false }));
    await waitFor(() => expect(load_data).toHaveBeenCalledOnce());

    act(() => data_events.notify_data_changed());
    expect(load_data).toHaveBeenCalledOnce();
  });
});
