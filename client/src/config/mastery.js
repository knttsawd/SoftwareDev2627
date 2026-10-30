import { CircleCheck, CircleHelp, CircleMinus, CircleX } from 'lucide-react';

// How each understanding level looks on the skill map. Every level has its own icon and
// words as well as a color, so it never depends on color alone. Colors are theme tokens;
// text colors are the pairings that pass contrast checks (see theme.css).
// The levels and their thresholds come from the server (server/services/mastery.js).
export const MASTERY_LEVEL_DETAILS = {
  strong: {
    label: 'Strong',
    icon: CircleCheck,
    node_classes: 'bg-mastery-strong text-white',
    description: '80% or more on recent quizzes',
  },
  developing: {
    label: 'Developing',
    icon: CircleMinus,
    node_classes: 'bg-mastery-developing text-ink-on-light',
    description: '50 to 79% on recent quizzes',
  },
  weak: {
    label: 'Needs work',
    icon: CircleX,
    node_classes: 'bg-mastery-weak text-white',
    description: 'Under 50% on recent quizzes',
  },
  untested: {
    label: 'Not tested',
    icon: CircleHelp,
    node_classes: 'bg-mastery-untested text-ink-on-light',
    description: 'No quiz taken yet',
  },
};

export const MASTERY_LEVEL_ORDER = ['strong', 'developing', 'weak', 'untested'];

// "Needs work · 40%" or "Not tested"
export function describe_mastery(topic) {
  const { label } = MASTERY_LEVEL_DETAILS[topic.mastery_level];
  return topic.mastery_score === null ? label : `${label} · ${topic.mastery_score}%`;
}

// The student's choice in the learning style quiz; "at_end" if they skipped it.
export const QUIZ_FEEDBACK_TIMING = { after_each: 'after_each', at_end: 'at_end' };

export function get_feedback_timing(account) {
  return account?.learning_profile?.feedback_timing ?? QUIZ_FEEDBACK_TIMING.at_end;
}
