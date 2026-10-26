import { ArrowRight, Brain, CalendarDays, FileText, GraduationCap, MessageCircle, Network, Sparkles, TrendingUp, Upload } from 'lucide-react';
import { Link } from 'react-router';
import { get_button_classes } from '../components/button_styles.js';
import PageTitle from '../components/PageTitle.jsx';
import { ROUTE_PATHS } from '../config/constants.js';
import { AUTH_STATUS, use_auth } from '../context/AuthContext.jsx';

const HOW_IT_WORKS_STEPS = [
  {
    icon: Upload,
    title: 'Add what you already have',
    text: 'Upload notes, PDFs, videos, audio or article links for each skill you are learning.',
  },
  {
    icon: Sparkles,
    title: 'Learn it, then test it',
    text: 'StudyApp turns your resources into guided lessons, study notes and practice quizzes, topic by topic.',
  },
  {
    icon: Network,
    title: 'Study what matters next',
    text: 'Your skill map shows which topics you know and which need work, so you always know where to start.',
  },
];

const ACCOUNT_BENEFITS = [
  {
    icon: FileText,
    title: 'All your resources in one place',
    text: 'Keep every note, file and link for each skill together, and come back to them anytime.',
  },
  {
    icon: Brain,
    title: 'Learn it step by step',
    text: 'Guided lessons, a learning path and practice with hints teach you new topics, not just test you on them.',
  },
  {
    icon: GraduationCap,
    title: 'Learn by teaching',
    text: 'Explain a topic to an AI student. If it can pass the quiz, you really understand it.',
  },
  {
    icon: CalendarDays,
    title: 'A plan that fits your week',
    text: 'Schedule study sessions around your life, then start a focused work block in one click.',
  },
  {
    icon: TrendingUp,
    title: 'Progress without the pressure',
    text: 'See how much you have improved with simple progress bars. No streaks, badges or levels to keep up with.',
  },
  {
    icon: MessageCircle,
    title: 'An assistant on every page',
    text: 'Ask it to make a quiz, plan your week or explain a topic, and it does it for you.',
  },
];

// The main button: signing up for visitors, or back to the dashboard for signed-in students.
function StartLink({ is_signed_in, extra_classes = '' }) {
  return (
    <Link to={is_signed_in ? ROUTE_PATHS.dashboard : ROUTE_PATHS.sign_up} className={get_button_classes('primary', extra_classes)}>
      {is_signed_in ? 'Go to your dashboard' : 'Create a free account'}
      <ArrowRight aria-hidden="true" className="h-4 w-4" />
    </Link>
  );
}

// The public landing page: what StudyApp does, how it works, and why to make an account.
// Signed-in students see the way back to their dashboard instead of sign-up and log-in.
function HomePage() {
  const { status } = use_auth();
  const is_signed_in = status === AUTH_STATUS.signed_in;

  return (
    <>
      <PageTitle page_name="Learn from what you already have" />

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:py-20 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading-1 font-bold text-ink sm:text-display">
            Study smarter with the resources you already have
          </h1>
          <p className="text-lead text-ink-muted">
            StudyApp turns your own notes, PDFs, videos and articles into study notes, quizzes and a plan, so you can
            find your weak spots and fix them.
          </p>
          <div className="flex flex-wrap gap-3">
            <StartLink is_signed_in={is_signed_in} />
            {!is_signed_in && (
              <Link to={ROUTE_PATHS.log_in} className={get_button_classes('secondary')}>
                Log in
              </Link>
            )}
          </div>
        </div>
        <img
          src="/images/skill-map-preview.svg"
          alt="Example skill map for Biology: Cells and Ecology are strong, Genetics is developing, Evolution needs work, and Food webs has not been tested yet."
          className="w-full rounded-2xl shadow-sm"
        />
      </section>

      <section aria-labelledby="how-it-works-heading" className="bg-surface py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="how-it-works-heading" className="text-heading-2 font-bold text-ink">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((step, step_index) => (
              <li key={step.title} className="flex flex-col gap-3 rounded-xl border border-border p-6">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-display font-bold text-white">
                    {step_index + 1}
                  </span>
                  <step.icon aria-hidden="true" className="h-6 w-6 text-brand-700" />
                </span>
                <h3 className="text-heading-3 font-semibold text-ink">{step.title}</h3>
                <p className="text-body text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="about" aria-labelledby="about-heading" className="scroll-mt-20 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="about-heading" className="text-heading-2 font-bold text-ink">
            About us
          </h2>
          <p className="mt-3 max-w-3xl text-lead text-ink-muted">
            We built StudyApp because most students already have plenty of study material. What is missing is a way to
            turn it into a plan. A free account gives you:
          </p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            {ACCOUNT_BENEFITS.map((benefit) => (
              <li key={benefit.title} className="flex gap-4 rounded-xl border border-border bg-surface p-6">
                <benefit.icon aria-hidden="true" className="h-7 w-7 shrink-0 text-accent-700" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-heading-3 font-semibold text-ink">{benefit.title}</h3>
                  <p className="text-body text-ink-muted">{benefit.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <StartLink is_signed_in={is_signed_in} extra_classes="mt-10" />
        </div>
      </section>
    </>
  );
}

export default HomePage;
