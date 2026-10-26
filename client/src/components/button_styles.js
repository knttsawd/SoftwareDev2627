// Shared button looks, used by both <button> elements and <Link>s styled as buttons.

const BASE_BUTTON_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-lg text-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

// Default padding for each axis, used unless extra_classes sets that axis itself. Two
// padding classes for one axis don't combine predictably (the one later in Tailwind's CSS
// wins), so only one is kept.
const DEFAULT_PADDING_BY_AXIS = [
  { default_class: 'px-4', override_pattern: /(^|\s)px-/ },
  { default_class: 'py-2.5', override_pattern: /(^|\s)py-/ },
];

// The default padding classes for the axes extra_classes doesn't set.
export function get_default_padding(extra_classes) {
  return DEFAULT_PADDING_BY_AXIS.filter(({ override_pattern }) => !override_pattern.test(extra_classes))
    .map(({ default_class }) => default_class)
    .join(' ');
}

const BUTTON_VARIANT_CLASSES = {
  primary: 'bg-brand-600 text-white hover:bg-brand-deep',
  secondary: 'border border-border bg-surface text-ink hover:bg-brand-50',
  ghost: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-danger-solid text-white hover:opacity-90',
};

// Returns the class list for a button of the given variant, plus any extra classes.
export function get_button_classes(variant = 'primary', extra_classes = '') {
  return [BASE_BUTTON_CLASSES, get_default_padding(extra_classes), BUTTON_VARIANT_CLASSES[variant], extra_classes]
    .filter(Boolean)
    .join(' ');
}
