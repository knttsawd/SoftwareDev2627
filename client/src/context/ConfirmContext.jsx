import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { get_button_classes } from '../components/button_styles.js';
import Dialog from '../components/Dialog.jsx';

const ConfirmContext = createContext(null);

// Asks with the browser's own box, for components shown outside ConfirmProvider.
export function confirm_with_browser({ message }) {
  return Promise.resolve(window.confirm(message));
}

// Holds the app's "Are you sure?" popup. Any component asks through use_confirm():
//   if (!(await confirm({ title, message, confirm_label, tone }))) return;
// tone 'danger' (the default) gives a red button for deleting; 'primary' a normal one.
// Cancel, the X button and Escape all answer false. Cancel has focus first, so pressing
// Enter by accident never deletes anything.
export function ConfirmProvider({ children }) {
  const [request, set_request] = useState(null);
  const cancel_button_ref = useRef(null);

  // Runs after the popup opens (the Dialog's own effect runs first), moving focus to Cancel.
  useEffect(() => {
    if (request) cancel_button_ref.current?.focus();
  }, [request]);

  const confirm = useCallback((options) => new Promise((resolve) => set_request({ options, resolve })), []);

  function answer(is_confirmed) {
    request.resolve(is_confirmed);
    set_request(null);
  }

  const options = request?.options;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog title={options?.title ?? ''} is_open={Boolean(request)} on_close={() => request && answer(false)}>
        <p className="text-body text-ink">{options?.message}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <button ref={cancel_button_ref} type="button" onClick={() => answer(false)} className={get_button_classes('secondary')}>
            {options?.cancel_label ?? 'Cancel'}
          </button>
          <button type="button" onClick={() => answer(true)} className={get_button_classes(options?.tone ?? 'danger')}>
            {options?.confirm_label}
          </button>
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

// Returns confirm(options) => Promise<boolean> (see ConfirmProvider).
export function use_confirm() {
  return useContext(ConfirmContext) ?? confirm_with_browser;
}
