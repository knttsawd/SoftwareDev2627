import { MASTERY_LEVEL_DETAILS, MASTERY_LEVEL_ORDER } from '../../config/mastery.js';

// The key to the map's colors: each level's icon, name and meaning, plus how many topics
// are at that level when counts ({ strong, developing, weak, untested }) is given.
function MasteryLegend({ counts }) {
  return (
    <ul aria-label="Map key" className="grid gap-x-6 gap-y-2 text-small text-ink sm:grid-cols-2">
      {MASTERY_LEVEL_ORDER.map((level) => {
        const { label, icon: LevelIcon, node_classes, description } = MASTERY_LEVEL_DETAILS[level];
        return (
          <li key={level} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${node_classes}`}>
              <LevelIcon aria-hidden="true" className="h-4 w-4" />
            </span>
            <span>
              <span className="font-semibold">
                {label}
                {counts && ` (${counts[level]})`}
              </span>
              <span className="text-ink-muted">: {description}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default MasteryLegend;
