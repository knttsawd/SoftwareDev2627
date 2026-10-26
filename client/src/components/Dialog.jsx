import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { get_button_classes } from './button_styles.js';

// A popup built on the browser's <dialog> element, which already traps keyboard focus
// inside it, closes on Escape and hides the rest of the page from screen readers.
// The parent owns is_open; on_close runs for the X button and for Escape.
// Children only render while open, so forms inside start fresh each time.
function Dialog({ title, is_open, on_close, children }) {
  const dialog_ref = useRef(null);
  const title_id = useId();

  useEffect(() => {
    const dialog_element = dialog_ref.current;
    if (is_open && !dialog_element.open) dialog_element.showModal();
    if (!is_open && dialog_element.open) dialog_element.close();
  }, [is_open]);

  return (
    <dialog
      ref={dialog_ref}
      aria-labelledby={title_id}
      onClose={on_close}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl bg-surface p-0 text-ink shadow-xl backdrop:bg-backdrop/50"
    >
      {is_open && (
        <div className="flex max-h-[85vh] flex-col gap-5 overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={title_id} className="text-heading-2 font-bold">
              {title}
            </h2>
            <button type="button" onClick={on_close} className={get_button_classes('ghost', 'px-2')}>
              <X aria-hidden="true" className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export default Dialog;
