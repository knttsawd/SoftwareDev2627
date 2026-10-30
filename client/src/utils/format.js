// Display formatting shared by several components.

const DATE_FORMAT = { month: 'short', day: 'numeric', year: 'numeric' };
const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

// "2026-10-24T17:05:00.000Z" -> "Oct 24, 2026" (in the student's own locale and time zone).
export function format_date(iso_timestamp) {
  return new Date(iso_timestamp).toLocaleDateString(undefined, DATE_FORMAT);
}

// 12345 -> "12.3K characters", 1 -> "1 character"
export function format_character_count(character_count) {
  return `${COMPACT_NUMBER_FORMAT.format(character_count)} character${character_count === 1 ? '' : 's'}`;
}

// 0 -> "A", 3 -> "D": letters for multiple-choice options.
export function get_choice_letter(choice_index) {
  return String.fromCharCode('A'.charCodeAt(0) + choice_index);
}
