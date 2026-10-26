import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { STACK_SCROLL_SETTLE_MS } from '../../config/constants.js';
import { find_active_member } from '../../utils/widget_layout.js';
import { DEFAULT_SHAPE } from './WidgetBlocks.jsx';
import WidgetView from './WidgetView.jsx';

// The pager's arrows: small round buttons inside its pill.
const ARROW_CLASSES =
  'flex h-6 w-6 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none';
// The pill both views' controls sit in, like a segmented control.
const PILL_CLASSES = 'items-center gap-0.5 rounded-full bg-[var(--widget-soft)] p-0.5 ring-1 ring-[var(--widget-line)] ring-inset';

// A smart stack's content: one widget at a time.
//   "swipe"  the widgets sit side by side on a track that snaps to each one, so a finger or
//            a trackpad swipes between them; the pager pill below (arrows and dots) picks
//            one too, and so do the arrow keys while the track has focus
//   "list"   a pill of the widgets' titles to pick from, like a segmented control
// on_select(widget) saves which one shows; on_state_change(widget, state) saves a widget's
// ticks. fixed_height (pixels, or null) is an app's height set by resizing the stack, and
// shape the stack's shape, which each widget lays itself out for, and accent the stack's
// accent, for its apps.
function StackView({ stack_item, id_prefix, fixed_height, shape = DEFAULT_SHAPE, accent, on_select, on_state_change }) {
  const { members } = stack_item;
  const active_member = find_active_member(stack_item);
  const active_index = members.indexOf(active_member);
  const { view } = stack_item.record;
  const track_ref = useRef(null);
  const settle_timer = useRef(null);

  // Keeps the track on the active widget, after a dot, an arrow, or a change elsewhere.
  useEffect(() => {
    const track = track_ref.current;
    if (!track) return;
    const target_left = active_index * track.clientWidth;
    if (Math.abs(track.scrollLeft - target_left) > 1) track.scrollTo?.({ left: target_left, behavior: 'smooth' });
  }, [active_index, view]);

  useEffect(() => () => clearTimeout(settle_timer.current), []);

  // Once a swipe settles, the widget it landed on becomes the one that shows.
  function handle_scroll() {
    clearTimeout(settle_timer.current);
    settle_timer.current = setTimeout(() => {
      const track = track_ref.current;
      if (!track || track.clientWidth === 0) return;
      const landed_member = members[Math.round(track.scrollLeft / track.clientWidth)];
      if (landed_member && landed_member !== active_member) on_select(landed_member);
    }, STACK_SCROLL_SETTLE_MS);
  }

  // Left and right on the focused track show the previous or next widget.
  function handle_track_key(key_event) {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[key_event.key];
    const next_member = step && members[active_index + step];
    if (!next_member) return;
    key_event.preventDefault();
    on_select(next_member);
  }

  function render_member(member) {
    return (
      <WidgetView
        widget={member}
        id_prefix={`${id_prefix}-${member.id}`}
        fixed_height={member.kind === 'app' ? fixed_height : null}
        shape={shape}
        accent={accent}
        on_state_change={(state) => on_state_change(member, state)}
      />
    );
  }

  if (view === 'list') {
    return (
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label="Widgets in this stack" className={`flex max-w-full self-start overflow-x-auto ${PILL_CLASSES}`}>
          {members.map((member) => {
            const is_active = member === active_member;
            return (
              <button
                key={member.id}
                id={`${id_prefix}-tab-${member.id}`}
                type="button"
                role="tab"
                aria-selected={is_active}
                aria-controls={`${id_prefix}-tabpanel`}
                onClick={() => on_select(member)}
                className={`shrink-0 rounded-full px-3 py-1 text-small whitespace-nowrap transition ${is_active ? 'bg-surface font-semibold text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
              >
                {member.title}
              </button>
            );
          })}
        </div>
        <div role="tabpanel" id={`${id_prefix}-tabpanel`} aria-labelledby={`${id_prefix}-tab-${active_member.id}`}>
          {render_member(active_member)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={track_ref}
        role="group"
        aria-label="Widgets in this stack. Swipe, or use the left and right arrow keys."
        tabIndex={0}
        onScroll={handle_scroll}
        onKeyDown={handle_track_key}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {members.map((member, member_index) => (
          <div
            key={member.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${member.title}, ${member_index + 1} of ${members.length}`}
            inert={member !== active_member}
            className="w-full shrink-0 snap-start snap-always"
          >
            {render_member(member)}
          </div>
        ))}
      </div>
      <div className={`flex self-center ${PILL_CLASSES}`}>
        <button type="button" disabled={active_index === 0} onClick={() => on_select(members[active_index - 1])} className={ARROW_CLASSES}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Previous widget</span>
        </button>
        {members.map((member) => {
          const is_active = member === active_member;
          return (
            <button
              key={member.id}
              type="button"
              aria-current={is_active ? 'true' : undefined}
              onClick={() => on_select(member)}
              className="group/dot flex h-6 w-6 items-center justify-center rounded-full"
            >
              <span aria-hidden="true" className={`h-1.5 rounded-full transition-all ${is_active ? 'w-3.5 bg-[var(--widget-accent)]' : 'w-1.5 bg-ink-muted/40 group-hover/dot:bg-ink-muted'}`} />
              <span className="sr-only">Show {member.title}</span>
            </button>
          );
        })}
        <button type="button" disabled={active_index === members.length - 1} onClick={() => on_select(members[active_index + 1])} className={ARROW_CLASSES}>
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Next widget</span>
        </button>
      </div>
    </div>
  );
}

export default StackView;
