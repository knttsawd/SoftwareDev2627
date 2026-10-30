// "Step 1 of 2" text plus a progress bar for multi-step forms like sign-up.
function StepIndicator({ current_step, step_count, step_name }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small font-semibold text-brand-700">
        Step {current_step} of {step_count}: {step_name}
      </p>
      <progress
        value={current_step}
        max={step_count}
        aria-label={`Sign-up progress: step ${current_step} of ${step_count}`}
        className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
      />
    </div>
  );
}

export default StepIndicator;
