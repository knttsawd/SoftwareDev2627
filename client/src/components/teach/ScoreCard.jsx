// One score with its bar and a line saying what it means, e.g. "Pip's score: 40%".
// is_highlighted gives the main result (the teaching grade) a stronger look.
function ScoreCard({ label, score, detail, icon: CardIcon, is_highlighted = false }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-4 ${is_highlighted ? 'border-brand-600 bg-brand-50' : 'border-border bg-surface'}`}
    >
      <p className="flex items-center gap-2 text-small font-semibold text-ink">
        <CardIcon aria-hidden="true" className="h-4 w-4 text-brand-700" />
        {label}
      </p>
      <p className="font-display text-heading-2 font-bold text-ink">{score}%</p>
      <progress
        value={score}
        max={100}
        aria-label={`${label}: ${score}%`}
        className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
      />
      <p className="text-caption text-ink-muted">{detail}</p>
    </div>
  );
}

export default ScoreCard;
