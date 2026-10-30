import { useCallback, useEffect, useRef, useState } from 'react';
import { DATA_CHANGED_EVENT } from '../utils/data_events.js';

// Loads data from the API when a component mounts, and again whenever anything in
// dependencies changes. Returns { data, error, is_loading, reload, set_data }:
//   reload()          fetch again
//   set_data(next)    replace or update the data locally (e.g. after adding an item),
//                     taking a value or a function of the current data
// Answers that arrive after the component moved on (unmounted, or dependencies changed)
// are ignored, so an old request can't overwrite newer data.
// Unless live is false, it also refreshes quietly whenever notify_data_changed() reports a
// change (a save anywhere, the assistant, another tab): what's on screen stays put while
// the new copy loads, and a failed refresh keeps it rather than showing an error. Views
// of one activity in progress (a lesson, a reading guide) pass live: false, so a change
// elsewhere can't restart them or ask the AI again.
export function use_api_data(load_data, dependencies, { live = true } = {}) {
  const [load_state, set_load_state] = useState({ data: null, error: '', is_loading: true });
  const [reload_count, set_reload_count] = useState(0);
  const is_quiet_ref = useRef(false);

  useEffect(() => {
    let is_current = true;
    const is_quiet = is_quiet_ref.current;
    is_quiet_ref.current = false;
    if (!is_quiet) set_load_state((current_state) => ({ ...current_state, error: '', is_loading: true }));
    load_data()
      .then((loaded_data) => {
        if (is_current) set_load_state({ data: loaded_data, error: '', is_loading: false });
      })
      .catch((load_error) => {
        if (is_current && !is_quiet) set_load_state({ data: null, error: load_error.message, is_loading: false });
      });
    return () => {
      is_current = false;
    };
    // load_data is usually a new arrow function each render; the caller lists what it depends on.
  }, [...dependencies, reload_count]);

  const reload = useCallback(() => set_reload_count((current_count) => current_count + 1), []);
  useEffect(() => {
    if (!live) return undefined;
    function refresh_quietly() {
      is_quiet_ref.current = true;
      reload();
    }
    window.addEventListener(DATA_CHANGED_EVENT, refresh_quietly);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh_quietly);
  }, [live, reload]);
  const set_data = useCallback(
    (next_data) =>
      set_load_state((current_state) => ({
        ...current_state,
        data: typeof next_data === 'function' ? next_data(current_state.data) : next_data,
      })),
    [],
  );

  return { ...load_state, reload, set_data };
}
