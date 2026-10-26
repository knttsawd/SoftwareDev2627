import { CircleAlert, CircleCheck } from 'lucide-react';

const ALERT_TONES = {
  error: { icon: CircleAlert, classes: 'border-danger bg-danger-soft text-danger' },
  success: { icon: CircleCheck, classes: 'border-success bg-success-soft text-success' },
};

// A message box with an icon, so the tone is never shown by color alone.
// role="alert" makes screen readers read it out as soon as it appears.
function AlertMessage({ tone = 'error', children }) {
  const { icon: ToneIcon, classes } = ALERT_TONES[tone];
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-small font-medium ${classes}`}>
      <ToneIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export default AlertMessage;
