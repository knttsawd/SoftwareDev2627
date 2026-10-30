import { DATA_CHANGE_DELAY_MS, RETURN_REFRESH_AFTER_MS, SYNC_CHANNEL_NAME } from '../config/constants.js';

// Page-wide signals that keep what's on screen in step with the student's data.
//   DATA_CHANGED_EVENT   something changed (a save here, the assistant, another tab, or
//                        the student coming back to the tab), so data on screen reloads
//   SESSION_ENDED_EVENT  the server stopped accepting the login, so the app signs out
// use_api_data listens for the first; AuthProvider for the second.

export const DATA_CHANGED_EVENT = 'studyapp:data-changed';
export const SESSION_ENDED_EVENT = 'studyapp:session-ended';

let pending_change_timer = null;
let sync_channel = null;

export function notify_data_changed(target = window) {
  target.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

export function notify_session_ended(target = window) {
  target.dispatchEvent(new Event(SESSION_ENDED_EVENT));
}

// The tab's one channel to the app's other open tabs, or null where the browser has none.
// A channel never hears its own messages, so a tab doesn't reload twice for its own saves.
export function get_sync_channel() {
  if (!sync_channel && typeof BroadcastChannel !== 'undefined') sync_channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  return sync_channel;
}

// Reports a save made in this tab, here and to the other tabs. Several saves in quick
// succession (adding three topics) become one reload.
export function announce_data_change() {
  if (pending_change_timer) return;
  pending_change_timer = setTimeout(() => {
    pending_change_timer = null;
    notify_data_changed();
    get_sync_channel()?.postMessage(DATA_CHANGED_EVENT);
  }, DATA_CHANGE_DELAY_MS);
}

// While the dashboard is open: reloads when another tab saves something, and when the
// student comes back to this tab after at least RETURN_REFRESH_AFTER_MS away (they may
// have studied on their phone meanwhile). Returns a function that stops listening.
// now() is injectable for tests.
export function start_data_sync(now = Date.now) {
  const channel = get_sync_channel();
  let hidden_since = null;

  function handle_message(message_event) {
    if (message_event.data === DATA_CHANGED_EVENT) notify_data_changed();
  }

  function handle_visibility_change() {
    if (document.visibilityState === 'hidden') {
      hidden_since = now();
      return;
    }
    if (hidden_since !== null && now() - hidden_since >= RETURN_REFRESH_AFTER_MS) notify_data_changed();
    hidden_since = null;
  }

  channel?.addEventListener('message', handle_message);
  document.addEventListener('visibilitychange', handle_visibility_change);
  return () => {
    channel?.removeEventListener('message', handle_message);
    document.removeEventListener('visibilitychange', handle_visibility_change);
  };
}
