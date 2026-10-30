import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

// How each direction of change looks. Every metric on the Progress page is better when it
// goes up, so up is green and down is red.
const DIRECTION_DETAILS = {
  up: { icon: ArrowUpRight, classes: 'text-success' },
  down: { icon: ArrowDownRight, classes: 'text-danger' },
  same: { icon: Minus, classes: 'text-ink-muted' },
};

// One headline number with what it means and how it changed: label, value (already
// formatted), and change = { direction, text } from describe_change. The change always
// says its direction in words, so it never relies on its color or arrow.
function StatTile({ label, value, detail, change }) {
  const direction_details = change?.direction ? DIRECTION_DETAILS[change.direction] : null;
  return (
    <div className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <p className="text-small text-ink-muted">{label}</p>
      <p className="font-display text-heading-2 font-semibold text-ink">{value}</p>
      {detail && <p className="text-caption text-ink-muted">{detail}</p>}
      {change && (
        <p className={`flex items-center gap-1 text-caption font-semibold ${direction_details?.classes ?? 'text-ink-muted'}`}>
          {direction_details && <direction_details.icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
          {change.text}
        </p>
      )}
    </div>
  );
}

export default StatTile;
