import { useState } from 'react';
import { Link } from 'react-router';
import AlertMessage from '../components/AlertMessage.jsx';
import AuthCard from '../components/AuthCard.jsx';
import { get_button_classes } from '../components/button_styles.js';
import FormField from '../components/FormField.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { ROUTE_PATHS } from '../config/constants.js';
import { SIGN_OUT_REASONS, use_auth } from '../context/AuthContext.jsx';

// Shown above the form when the student was signed out without pressing Log out.
export const SIGN_OUT_NOTES = {
  [SIGN_OUT_REASONS.session_ended]: 'Your session ended. Log in again to carry on where you were.',
  [SIGN_OUT_REASONS.logged_out_elsewhere]: 'You logged out in another tab. Log in again to carry on.',
};

// Login form. After a successful login, RequireGuest sends the student to the page they
// were trying to reach, or the dashboard.
function LoginPage() {
  const { log_in, sign_out_reason } = use_auth();
  const sign_out_note = SIGN_OUT_NOTES[sign_out_reason];
  const [email, set_email] = useState('');
  const [password, set_password] = useState('');
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [is_submitting, set_is_submitting] = useState(false);

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_is_submitting(true);
    set_form_error('');
    try {
      await log_in(email, password);
    } catch (login_error) {
      set_field_errors(login_error.field_errors ?? {});
      set_form_error(login_error.message);
      set_is_submitting(false);
    }
  }

  return (
    <AuthCard title="Welcome back" intro="Log in to pick up where you left off.">
      <PageTitle page_name="Log in" />
      {sign_out_note && (
        <p role="status" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-small text-ink">
          {sign_out_note}
        </p>
      )}
      <form onSubmit={handle_submit} noValidate className="flex flex-col gap-4">
        <FormField
          field_id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          on_change={set_email}
          error={field_errors.email}
        />
        <FormField
          field_id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          on_change={set_password}
          error={field_errors.password}
        />
        {form_error && <AlertMessage>{form_error}</AlertMessage>}
        <button type="submit" disabled={is_submitting} className={get_button_classes('primary')}>
          {is_submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="text-small text-ink-muted">
        New to StudyApp?{' '}
        <Link to={ROUTE_PATHS.sign_up} className="font-semibold text-brand-700 underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}

export default LoginPage;
