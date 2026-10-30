import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Hourglass, PartyPopper, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CHECKLIST_COLUMNS_MIN_ITEMS, CLOCK_REFRESH_MS, COUNTDOWN_REFRESH_MS, LIVE_COMPACT_ITEMS, MS_PER_DAY } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { use_now } from '../../hooks/use_now.js';
import { fetch_live_widget_data } from '../../services/widget_service.js';
import { play_chime } from '../../utils/chime.js';
import {
  describe_countdown,
  describe_countdown_end,
  format_clock,
  get_checked_items,
  pick_countdown_units,
  read_timer,
  save_timer,
  split_countdown,
  toggle_checked_item,
} from '../../utils/widgets.js';
import AlertMessage from '../AlertMessage.jsx';
import MarkdownContent from '../MarkdownContent.jsx';

// The blocks a card widget is built from (see server/services/widget_specs.js). Each gets
// its block and the widget's shape ({ size, orientation }, see describe_shape), and lays
// itself out for it: compact widgets get smaller text and tighter layouts, large or
// landscape ones spread out, and some blocks fill a widget whose height is set. The
// checklist also gets the widget's state and on_state_change(state) to save ticks.
// block_id is unique on the page, for labels.

// The shape before a widget is measured, or outside a widget.
export const DEFAULT_SHAPE = { size: 'regular', orientation: null };
const TEXT_SIZE_CLASSES = { compact: 'text-small', regular: 'text-body', large: 'text-body' };
// Soft panels inside a widget follow its look (--widget-soft and --widget-line in theme.css).
const SOFT_SURFACE = 'bg-[var(--widget-soft)] ring-1 ring-[var(--widget-line)] ring-inset';
// Blocks that grow to fill a widget whose height is set.
const FILLING_BLOCK_TYPES = ['flashcards'];

// A round button showing only an icon, named for screen readers, for controls inside widgets.
function IconButton({ label, icon: Icon, ...button_props }) {
  return (
    <button
      type="button"
      {...button_props}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-surface hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--widget-soft)] disabled:hover:shadow-none ${SOFT_SURFACE}`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

// Round check circles in the widget's accent, a progress bar, and two columns when wide.
function ChecklistBlock({ block, block_index, block_id, state, on_state_change, shape }) {
  const checked_items = get_checked_items(state, block_index, block.items.length);
  const done_count = checked_items.filter(Boolean).length;
  const has_columns = block.items.length >= CHECKLIST_COLUMNS_MIN_ITEMS && (shape.size === 'large' || shape.orientation === 'landscape');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div aria-hidden="true" className={`h-1.5 flex-1 overflow-hidden rounded-full ${SOFT_SURFACE}`}>
          <div className="h-full rounded-full bg-[var(--widget-accent)] transition-[width] duration-300" style={{ width: `${(done_count / block.items.length) * 100}%` }} />
        </div>
        <span className="text-caption font-semibold text-ink-muted tabular-nums">
          {done_count}/{block.items.length}
          <span className="sr-only"> done</span>
        </span>
      </div>
      <ul className={`grid gap-x-4 gap-y-0.5 ${has_columns ? 'grid-cols-2' : ''}`}>
        {block.items.map((item, item_index) => {
          const item_id = `${block_id}-item-${item_index}`;
          const is_checked = checked_items[item_index];
          return (
            <li key={item_id}>
              <label htmlFor={item_id} className={`-mx-1.5 flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-[var(--widget-soft)] ${TEXT_SIZE_CLASSES[shape.size]}`}>
                <span className="relative mt-0.5 flex h-[1.125rem] w-[1.125rem] shrink-0">
                  <input
                    id={item_id}
                    type="checkbox"
                    checked={is_checked}
                    onChange={() => on_state_change(toggle_checked_item(state, block_index, item_index, block.items.length))}
                    className="peer h-full w-full cursor-pointer appearance-none rounded-full border-2 border-ink-muted/50 transition-colors checked:border-[var(--widget-accent)] checked:bg-[var(--widget-accent)]"
                  />
                  <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 text-surface peer-checked:block" />
                </span>
                <span className={is_checked ? 'text-ink-muted line-through decoration-ink-muted/60' : 'text-ink'}>{item}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The time left as big numbers, in units that fit it (pick_countdown_units): days, hours
// and minutes a day or more away; hours, minutes and seconds within a day; minutes and
// seconds within an hour. Compact shows the first unit, or a clock within a day; regular
// shows two tiles; large or landscape three. Within a day it ticks every second. The
// sentence form is there for screen readers.
function CountdownBlock({ block, shape }) {
  const is_within_day = new Date(block.target).getTime() - Date.now() < MS_PER_DAY;
  const now = use_now(is_within_day ? CLOCK_REFRESH_MS : COUNTDOWN_REFRESH_MS);
  const time_left = split_countdown(block.target, now);
  const units = pick_countdown_units(time_left);
  const tile_count = Math.min(units.length, shape.size === 'large' || shape.orientation === 'landscape' ? 3 : 2);

  let time_display;
  if (time_left.is_past) {
    time_display = (
      <p className="flex items-center gap-2 font-display text-heading-2 font-semibold text-ink">
        <PartyPopper className="h-6 w-6 text-[var(--widget-accent)]" />
        It&apos;s here
      </p>
    );
  } else if (shape.size === 'compact') {
    const seconds_left = (new Date(block.target).getTime() - now.getTime()) / 1000;
    time_display =
      time_left.days > 0 ? (
        <p className="flex items-baseline gap-1.5 text-ink">
          <span className="font-display text-display leading-none font-semibold tabular-nums">{units[0].value}</span>
          <span className="text-small text-ink-muted">{units[0].label}</span>
        </p>
      ) : (
        <p className="font-display text-display leading-none font-semibold text-ink tabular-nums">{format_clock(seconds_left)}</p>
      );
  } else {
    time_display = (
      <div className={`grid gap-2 ${tile_count === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {units.slice(0, tile_count).map((unit, unit_index) => (
          <div key={unit_index} className={`flex flex-col items-center rounded-xl px-2 py-2.5 ${SOFT_SURFACE}`}>
            <span className={`font-display leading-none font-semibold text-ink tabular-nums ${shape.size === 'large' ? 'text-display' : 'text-heading-1'}`}>
              {unit.value}
            </span>
            <span className="mt-1 text-caption text-ink-muted">{unit.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="sr-only">{describe_countdown(block.target, now).text}</p>
      <div aria-hidden="true">{time_display}</div>
      <p className="flex items-center gap-1.5 text-small text-ink-muted">
        <Hourglass aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--widget-accent)]" />
        <span>
          <span className="font-semibold text-ink">{block.label}</span> · {describe_countdown_end(block.target, now)}
        </span>
      </p>
    </div>
  );
}

// The progress ring around a timer: the accent arc shrinks as time runs out.
function TimerRing({ fraction_left, size_px, children }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative shrink-0" style={{ width: size_px, height: size_px }}>
      <svg aria-hidden="true" viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="6" className="stroke-[var(--widget-line)]" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction_left)}
          className="stroke-[var(--widget-accent)] transition-[stroke-dashoffset] duration-500 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// A timer the student starts: block.seconds long, with start, pause, resume and reset, and
// a chime when it ends while showing. It's kept in the widget's state as when it ends (or
// how much was left when paused), so it carries on across pages and reloads (read_timer,
// save_timer). Compact shows the clock and its buttons in a row; otherwise a progress ring,
// beside the buttons when landscape and bigger when large.
function TimerBlock({ block, block_index, state, on_state_change, shape }) {
  const is_running_now = read_timer(state, block_index, block.seconds, new Date()).status === 'running';
  const now = use_now(CLOCK_REFRESH_MS, is_running_now);
  const timer = read_timer(state, block_index, block.seconds, now);
  const previous_status = useRef(timer.status);

  useEffect(() => {
    if (previous_status.current === 'running' && timer.status === 'done') play_chime();
    previous_status.current = timer.status;
  }, [timer.status]);

  const save = (saved_timer) => on_state_change(save_timer(state, block_index, saved_timer));
  const start = () => save({ ends_at: new Date(Date.now() + (timer.status === 'done' ? block.seconds * 1000 : timer.remaining_ms)).toISOString() });
  const pause = () => save({ remaining_ms: timer.remaining_ms });
  const reset = () => save(null);
  const clock = format_clock(timer.remaining_ms / 1000);
  const status_text = { ready: 'Ready', running: 'Running', paused: 'Paused', done: "Time's up" }[timer.status];

  const main_button =
    timer.status === 'running' ? (
      <IconButton label={`Pause ${block.label}`} icon={Pause} onClick={pause} />
    ) : (
      <IconButton label={`${timer.status === 'paused' ? 'Resume' : 'Start'} ${block.label}`} icon={Play} onClick={start} />
    );
  const reset_button = timer.status !== 'ready' && <IconButton label={`Reset ${block.label}`} icon={RotateCcw} onClick={reset} />;

  const announcement = <p className="sr-only" aria-live="polite">{timer.status === 'done' ? `${block.label}: time's up` : ''}</p>;

  if (shape.size === 'compact') {
    return (
      <div className="flex items-center gap-2">
        {announcement}
        <div className="min-w-0 flex-1">
          <p className="font-display text-heading-1 leading-none font-semibold text-ink tabular-nums">{clock}</p>
          <p className="mt-1 truncate text-caption text-ink-muted">
            {block.label} · {status_text}
          </p>
        </div>
        {reset_button}
        {main_button}
      </div>
    );
  }

  const ring_size = shape.size === 'large' ? 176 : 132;
  return (
    <div className={`flex items-center gap-4 ${shape.orientation === 'landscape' ? 'flex-row' : 'flex-col'}`}>
      {announcement}
      <TimerRing fraction_left={timer.remaining_ms / (block.seconds * 1000)} size_px={ring_size}>
        <span className={`font-display leading-none font-semibold text-ink tabular-nums ${shape.size === 'large' ? 'text-display' : 'text-heading-1'}`}>{clock}</span>
        <span className="mt-1 text-caption text-ink-muted">{status_text}</span>
      </TimerRing>
      <div className="flex flex-col items-center gap-2">
        <p className="text-small font-semibold text-ink">{block.label}</p>
        <div className="flex items-center gap-2">
          {reset_button}
          {main_button}
        </div>
      </div>
    </div>
  );
}

const CARD_TEXT_CLASSES = { compact: 'text-body', regular: 'text-lead', large: 'text-heading-3' };
const CARD_HEIGHT_CLASSES = { compact: 'min-h-24', regular: 'min-h-32', large: 'min-h-40' };
const CARD_FACE_CLASSES =
  'flex flex-col items-center justify-center gap-1 rounded-2xl p-4 text-center [grid-area:1/1] [backface-visibility:hidden]';

// One card at a time, which turns over to show the answer when pressed. Round buttons go
// to the previous and next cards. With a set height, the card fills the space left (and
// has no height of its own, so the buttons always stay in view).
function FlashcardsBlock({ block, block_id, shape }) {
  const [card_index, set_card_index] = useState(0);
  const [is_showing_back, set_is_showing_back] = useState(false);
  const card = block.cards[card_index];
  const fills_height = shape.orientation !== null;

  function go_to_card(next_index) {
    set_card_index(next_index);
    set_is_showing_back(false);
  }

  return (
    <div className={`flex flex-col gap-2 ${fills_height ? 'h-full' : ''}`}>
      <button
        type="button"
        onClick={() => set_is_showing_back(!is_showing_back)}
        aria-describedby={`${block_id}-hint`}
        className={`grid rounded-2xl text-left [perspective:900px] ${fills_height ? 'min-h-0 flex-1' : CARD_HEIGHT_CLASSES[shape.size]}`}
      >
        <span className={`grid transition-transform duration-500 [transform-style:preserve-3d] ${is_showing_back ? '[transform:rotateY(180deg)]' : ''}`}>
          <span aria-hidden={is_showing_back} className={`${CARD_FACE_CLASSES} ${SOFT_SURFACE}`}>
            <span aria-hidden="true" className="text-caption font-semibold tracking-wide text-ink-muted uppercase">
              Question
            </span>
            <span className={`font-semibold text-ink ${CARD_TEXT_CLASSES[shape.size]}`}>
              <span className="sr-only">Question:</span> {card.front}
            </span>
          </span>
          <span
            aria-hidden={!is_showing_back}
            className={`${CARD_FACE_CLASSES} bg-[color-mix(in_oklab,var(--widget-accent)_12%,var(--color-surface))] ring-1 ring-border ring-inset [transform:rotateY(180deg)]`}
          >
            <span aria-hidden="true" className="text-caption font-semibold tracking-wide text-ink-muted uppercase">
              Answer
            </span>
            <span className={`text-ink ${CARD_TEXT_CLASSES[shape.size]}`}>
              <span className="sr-only">Answer:</span> {card.back}
            </span>
          </span>
        </span>
      </button>
      <p id={`${block_id}-hint`} className="sr-only">
        {is_showing_back ? 'Press to see the question again.' : 'Press to see the answer.'}
      </p>
      <div className="flex items-center justify-between gap-2">
        <IconButton label="Previous card" icon={ChevronLeft} onClick={() => go_to_card(card_index - 1)} disabled={card_index === 0} />
        <span className="text-caption font-semibold text-ink-muted tabular-nums">
          <span aria-hidden="true">
            {card_index + 1} / {block.cards.length}
          </span>
          <span className="sr-only">
            Card {card_index + 1} of {block.cards.length}
          </span>
        </span>
        <IconButton label="Next card" icon={ChevronRight} onClick={() => go_to_card(card_index + 1)} disabled={card_index === block.cards.length - 1} />
      </div>
    </div>
  );
}

// A grouped list with chevrons when compact; rounded pills that wrap when there's room.
function LinksBlock({ block, shape }) {
  if (shape.size === 'compact') {
    return (
      <ul className={`divide-y divide-border overflow-hidden rounded-xl ${SOFT_SURFACE}`}>
        {block.links.map((link) => (
          <li key={link.path + link.label}>
            <Link to={link.path} className="flex items-center justify-between gap-2 px-3 py-2 text-small font-semibold text-ink transition-colors hover:bg-surface">
              {link.label}
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {block.links.map((link) => (
        <li key={link.path + link.label}>
          <Link
            to={link.path}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-semibold text-ink transition hover:bg-surface hover:shadow-sm ${SOFT_SURFACE}`}
          >
            {link.label}
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 text-ink-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// "Biology · 27 Oct, 09:00": an item's detail and time, if it has them.
function describe_live_detail(item) {
  return [item.detail, item.starts_at && new Date(item.starts_at).toLocaleString()].filter(Boolean).join(' · ');
}

// The student's own data, fetched each time it's shown (and whenever data changes): rows,
// the first few when compact, or tiles in two columns when large or landscape.
function LiveBlock({ block, shape }) {
  const live_state = use_api_data(() => fetch_live_widget_data(block.source, block.skill_id), [block.source, block.skill_id]);
  if (live_state.error) return <AlertMessage>{live_state.error}</AlertMessage>;
  if (!live_state.data) return <p className="text-small text-ink-muted">Loading…</p>;
  if (live_state.data.items.length === 0) return <p className="text-small text-ink-muted">Nothing here yet.</p>;
  const items = shape.size === 'compact' ? live_state.data.items.slice(0, LIVE_COMPACT_ITEMS) : live_state.data.items;
  const has_tiles = shape.size === 'large' || shape.orientation === 'landscape';
  return (
    <ul className={has_tiles ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-0.5'}>
      {items.map((item, item_index) => (
        <li key={`${item.label}-${item_index}`} className={`flex min-w-0 flex-col ${has_tiles ? `rounded-xl p-3 ${SOFT_SURFACE}` : '-mx-1.5 rounded-lg px-1.5 py-1'}`}>
          {item.link ? (
            <Link to={item.link} className={`truncate font-semibold text-brand-700 hover:underline ${TEXT_SIZE_CLASSES[shape.size]}`}>
              {item.label}
            </Link>
          ) : (
            <span className={`truncate font-semibold text-ink ${TEXT_SIZE_CLASSES[shape.size]}`}>{item.label}</span>
          )}
          {describe_live_detail(item) && <span className="truncate text-caption text-ink-muted">{describe_live_detail(item)}</span>}
        </li>
      ))}
    </ul>
  );
}

// Markdown, in smaller text when compact.
function MarkdownBlock({ block, shape }) {
  return (
    <div className={shape.size === 'compact' ? '[&_li]:text-small [&_p]:text-small' : ''}>
      <MarkdownContent markdown_text={block.markdown} />
    </div>
  );
}

const BLOCK_COMPONENTS = {
  markdown: MarkdownBlock,
  checklist: ChecklistBlock,
  countdown: CountdownBlock,
  timer: TimerBlock,
  flashcards: FlashcardsBlock,
  links: LinksBlock,
  live: LiveBlock,
};

// One block with its optional title. Unknown types (from a newer server) show nothing.
function WidgetBlock({ shape = DEFAULT_SHAPE, ...block_props }) {
  const BlockComponent = BLOCK_COMPONENTS[block_props.block.type];
  if (!BlockComponent) return null;
  const fills_height = shape.orientation !== null && FILLING_BLOCK_TYPES.includes(block_props.block.type);
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${fills_height ? 'flex-1' : ''}`}>
      {block_props.block.title && <p className="text-caption font-semibold tracking-wide text-ink-muted uppercase">{block_props.block.title}</p>}
      <BlockComponent {...block_props} shape={shape} />
    </div>
  );
}

export default WidgetBlock;
