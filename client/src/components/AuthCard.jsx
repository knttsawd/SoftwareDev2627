// Centered card used by the sign-up and login pages: heading, short intro, then the form.
function AuthCard({ title, intro, children }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-1 font-bold text-ink">{title}</h1>
          {intro && <p className="text-body text-ink-muted">{intro}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export default AuthCard;
