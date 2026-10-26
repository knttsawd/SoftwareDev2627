import { BookA, BookOpen, BookOpenCheck, Dumbbell, Route } from 'lucide-react';
import { Link } from 'react-router';
import { build_learn_path } from '../../utils/study_paths.js';

// The Learn page's tabs, in order. Each is a link (?tab=<id>), so the browser's back
// button and shared links keep the tab.
export const LEARN_TABS = [
  { id: 'path', label: 'Learning path', icon: Route },
  { id: 'lessons', label: 'Guided lessons', icon: BookOpenCheck },
  { id: 'practice', label: 'Practice', icon: Dumbbell },
  { id: 'reading', label: 'Reading', icon: BookOpen },
  { id: 'terms', label: 'Key terms', icon: BookA },
];
export const DEFAULT_LEARN_TAB = 'path';

// The tab named in the address, or the default for anything else.
export function find_learn_tab(tab_id) {
  return LEARN_TABS.some((learn_tab) => learn_tab.id === tab_id) ? tab_id : DEFAULT_LEARN_TAB;
}

// The row of tab links. The current one is marked with aria-current, a bar and bold text.
// On narrow screens the row scrolls sideways rather than wrapping onto a second line.
function LearnTabs({ skill_id, current_tab }) {
  return (
    <nav aria-label="Ways to learn">
      <ul className="flex gap-1 overflow-x-auto border-b border-border">
        {LEARN_TABS.map(({ id, label, icon: TabIcon }) => {
          const is_current = id === current_tab;
          return (
            <li key={id} className="shrink-0">
              <Link
                to={build_learn_path({ skill_id, tab: id })}
                aria-current={is_current ? 'page' : undefined}
                className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-small whitespace-nowrap ${is_current ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                <TabIcon aria-hidden="true" className="h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default LearnTabs;
