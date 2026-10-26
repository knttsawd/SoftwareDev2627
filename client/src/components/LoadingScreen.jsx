import { LOADING_DOT_DELAYS_MS } from '../config/constants.js';

// Loading animation: a pulsing logo and three bouncing dots. It covers the whole screen,
// or with is_full_screen false fills the space it's given (a dashboard page loading beside
// the sidebar). The motion-safe classes switch the animation off for students who ask
// their device for reduced motion. role="status" lets screen readers announce the label.
function LoadingScreen({ label = 'Loading', is_full_screen = true }) {
  const position_classes = is_full_screen ? 'fixed inset-0 z-50 bg-canvas' : 'min-h-[50vh]';
  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-5 ${position_classes}`}>
      <img src="/icons/logo.svg" alt="" className="h-16 w-16 motion-safe:animate-pulse" />
      <div className="flex gap-2" aria-hidden="true">
        {LOADING_DOT_DELAYS_MS.map((delay_ms) => (
          <span
            key={delay_ms}
            className="h-3 w-3 rounded-full bg-brand-600 motion-safe:animate-bounce"
            style={{ animationDelay: `${delay_ms}ms` }}
          />
        ))}
      </div>
      <p className="text-small font-medium text-ink-muted">{label}…</p>
    </div>
  );
}

export default LoadingScreen;
