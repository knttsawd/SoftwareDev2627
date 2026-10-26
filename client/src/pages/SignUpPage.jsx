import { useState } from 'react';
import { Link } from 'react-router';
import AlertMessage from '../components/AlertMessage.jsx';
import AuthCard from '../components/AuthCard.jsx';
import { get_button_classes } from '../components/button_styles.js';
import FormField from '../components/FormField.jsx';
import PageTitle from '../components/PageTitle.jsx';
import StepIndicator from '../components/StepIndicator.jsx';
import { ROUTE_PATHS, SIGN_UP_STEP_COUNT } from '../config/constants.js';
import { use_auth } from '../context/AuthContext.jsx';
import { check_username_available } from '../services/auth_service.js';

const EMPTY_SIGN_UP_VALUES = { first_name: '', last_name: '', username: '', email: '', password: '' };

// Sign-up step 1: account details. Creating the account also logs the student in, and
// RequireGuest then moves them on to step 2 (the learning style quiz).
function SignUpPage() {
  const { sign_up } = use_auth();
  const [values, set_values] = useState(EMPTY_SIGN_UP_VALUES);
  const [field_errors, set_field_errors] = useState({});
  const [form_error, set_form_error] = useState('');
  const [username_note, set_username_note] = useState('');
  const [is_password_shown, set_is_password_shown] = useState(false);
  const [is_submitting, set_is_submitting] = useState(false);

  function update_value(field_name, new_value) {
    set_values((current_values) => ({ ...current_values, [field_name]: new_value }));
    if (field_name === 'username') set_username_note('');
  }

  // Checks the username as soon as the student leaves the field, instead of waiting for submit.
  async function handle_username_blur() {
    const username = values.username.trim();
    if (!username) return;
    try {
      const is_available = await check_username_available(username);
      set_field_errors((current_errors) => ({
        ...current_errors,
        username: is_available ? undefined : 'That username is already taken',
      }));
      set_username_note(is_available ? 'That username is available' : '');
    } catch (check_error) {
      set_field_errors((current_errors) => ({ ...current_errors, username: check_error.message }));
    }
  }

  async function handle_submit(submit_event) {
    submit_event.preventDefault();
    set_is_submitting(true);
    set_form_error('');
    try {
      await sign_up(values);
    } catch (sign_up_error) {
      set_field_errors(sign_up_error.field_errors ?? {});
      set_form_error(sign_up_error.message);
      set_is_submitting(false);
    }
  }

  return (
    <AuthCard title="Create your account" intro="It's free, and takes about two minutes.">
      <PageTitle page_name="Sign up" />
      <StepIndicator current_step={1} step_count={SIGN_UP_STEP_COUNT} step_name="Your details" />

      <form onSubmit={handle_submit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            field_id="first_name"
            label="First name"
            autoComplete="given-name"
            required
            value={values.first_name}
            on_change={(new_value) => update_value('first_name', new_value)}
            error={field_errors.first_name}
          />
          <FormField
            field_id="last_name"
            label="Last name"
            autoComplete="family-name"
            required
            value={values.last_name}
            on_change={(new_value) => update_value('last_name', new_value)}
            error={field_errors.last_name}
          />
        </div>
        <FormField
          field_id="username"
          label="Username"
          autoComplete="username"
          required
          hint={username_note || '3 to 30 characters: letters, numbers and underscores'}
          value={values.username}
          on_change={(new_value) => update_value('username', new_value)}
          onBlur={handle_username_blur}
          error={field_errors.username}
        />
        <FormField
          field_id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          on_change={(new_value) => update_value('email', new_value)}
          error={field_errors.email}
        />
        <FormField
          field_id="password"
          label="Password"
          type={is_password_shown ? 'text' : 'password'}
          autoComplete="new-password"
          required
          hint="At least 8 characters"
          value={values.password}
          on_change={(new_value) => update_value('password', new_value)}
          error={field_errors.password}
        />
        <label className="flex items-center gap-2 text-small text-ink">
          <input
            type="checkbox"
            checked={is_password_shown}
            onChange={() => set_is_password_shown((is_shown) => !is_shown)}
            className="h-4 w-4 accent-brand-600"
          />
          Show password
        </label>

        {form_error && <AlertMessage>{form_error}</AlertMessage>}
        <button type="submit" disabled={is_submitting} className={get_button_classes('primary')}>
          {is_submitting ? 'Creating account…' : 'Continue'}
        </button>
      </form>

      <p className="text-small text-ink-muted">
        Already have an account?{' '}
        <Link to={ROUTE_PATHS.log_in} className="font-semibold text-brand-700 underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}

export default SignUpPage;
