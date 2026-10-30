import { useNavigate } from 'react-router';
import PageTitle from '../../components/PageTitle.jsx';
import AccountForm from '../../components/settings/AccountForm.jsx';
import AppearanceSettings from '../../components/settings/AppearanceSettings.jsx';
import {
  build_profile_updates,
  build_sign_in_updates,
  build_timer_updates,
  describe_sign_in_success,
} from '../../components/settings/account_updates.js';
import DeleteAccountSection from '../../components/settings/DeleteAccountSection.jsx';
import LearningProfileSettings from '../../components/settings/LearningProfileSettings.jsx';
import { BREAK_MINUTES_LIMITS, ROUTE_PATHS, WORK_MINUTES_LIMITS } from '../../config/constants.js';
import { use_auth } from '../../context/AuthContext.jsx';

const EMPTY_PASSWORDS = { new_password: '', confirm_password: '', current_password: '' };

// One titled section of the Settings page.
function SettingsSection({ section_id, title, description, children }) {
  return (
    <section aria-labelledby={section_id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={section_id} className="text-heading-3 font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="text-small text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// The Settings page: account details, email and password, the focus timer, light or dark
// mode, the learning style quiz, and deleting the account. Every save updates the signed-in account, so the
// rest of the app (the sidebar name, the timer) changes straight away.
function SettingsPage() {
  const { account, set_account, forget_account } = use_auth();
  const navigate = useNavigate();

  // Go home first: the dashboard would otherwise send a signed-out student to the login page.
  function handle_deleted() {
    navigate(ROUTE_PATHS.home);
    forget_account();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageTitle page_name="Settings" />
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 font-bold text-ink">Settings</h1>
        <p className="text-body text-ink-muted">Your account, your focus timer, how StudyApp looks and how you like to learn.</p>
      </div>

      <SettingsSection section_id="profile-heading" title="Your details">
        <AccountForm
          form_id="profile"
          fields={[
            { name: 'first_name', label: 'First name', autoComplete: 'given-name' },
            { name: 'last_name', label: 'Last name', autoComplete: 'family-name' },
            { name: 'username', label: 'Username', autoComplete: 'username', hint: 'Letters, numbers and underscores.' },
          ]}
          initial_values={{ first_name: account.first_name, last_name: account.last_name, username: account.username }}
          build_updates={(values) => build_profile_updates(values, account)}
          describe_success={() => 'Your details are saved.'}
          on_saved={set_account}
        />
      </SettingsSection>

      <SettingsSection
        section_id="sign-in-heading"
        title="Email and password"
        description="To change either, enter your current password too. Leave the new password blank to keep it."
      >
        <AccountForm
          form_id="sign-in"
          fields={[
            { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
            { name: 'current_password', label: 'Current password', type: 'password', autoComplete: 'current-password' },
            { name: 'new_password', label: 'New password', type: 'password', autoComplete: 'new-password', hint: 'At least 8 characters.' },
            { name: 'confirm_password', label: 'New password again', type: 'password', autoComplete: 'new-password' },
          ]}
          initial_values={{ email: account.email, ...EMPTY_PASSWORDS }}
          build_updates={(values) => build_sign_in_updates(values, account)}
          describe_success={describe_sign_in_success}
          values_after_save={(values) => ({ ...values, ...EMPTY_PASSWORDS })}
          on_saved={set_account}
        />
      </SettingsSection>

      <SettingsSection
        section_id="timer-heading"
        title="Focus timer"
        description="How long each work block lasts before a break. Retaking the learning style quiz resets these."
      >
        <AccountForm
          form_id="timer"
          fields={[
            { name: 'work_minutes', label: 'Focus minutes', type: 'number', ...WORK_MINUTES_LIMITS },
            { name: 'break_minutes', label: 'Break minutes', type: 'number', ...BREAK_MINUTES_LIMITS },
          ]}
          initial_values={{ work_minutes: String(account.work_minutes), break_minutes: String(account.break_minutes) }}
          build_updates={(values) => build_timer_updates(values, account)}
          describe_success={() => 'Your focus timer is saved.'}
          on_saved={set_account}
        />
      </SettingsSection>

      <SettingsSection section_id="appearance-heading" title="Appearance" description="Saved on this device.">
        <AppearanceSettings />
      </SettingsSection>

      <SettingsSection
        section_id="learning-heading"
        title="Learning style and goals"
        description="Your answers shape your study plan, your notes and when quizzes show the answers."
      >
        <LearningProfileSettings account={account} on_saved={set_account} />
      </SettingsSection>

      <SettingsSection section_id="delete-heading" title="Delete account">
        <DeleteAccountSection on_deleted={handle_deleted} />
      </SettingsSection>
    </div>
  );
}

export default SettingsPage;
