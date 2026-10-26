// What each Settings form sends: only the fields that changed, plus anything the server
// needs to allow the change. Each build_* returns { updates, field_errors }.

// Names and username, trimmed, compared with the account.
export function build_profile_updates(values, account) {
  const updates = {};
  for (const field_name of ['first_name', 'last_name', 'username']) {
    if (values[field_name].trim() !== account[field_name]) updates[field_name] = values[field_name];
  }
  return { updates, field_errors: {} };
}

// A new email and/or password. Both need the current password, and a new password must be
// typed twice the same.
export function build_sign_in_updates(values, account) {
  if (values.new_password !== values.confirm_password) {
    return { updates: {}, field_errors: { confirm_password: "The new passwords don't match" } };
  }
  const updates = {};
  if (values.email.trim().toLowerCase() !== account.email) updates.email = values.email;
  if (values.new_password) updates.password = values.new_password;
  if (Object.keys(updates).length > 0) updates.current_password = values.current_password;
  return { updates, field_errors: {} };
}

// The focus and break lengths, as numbers (the inputs give text). A blank is sent as null
// and a fraction as it is, and the server explains what's allowed.
export function build_timer_updates(values, account) {
  const updates = {};
  for (const field_name of ['work_minutes', 'break_minutes']) {
    const minutes = Number(values[field_name]);
    if (minutes !== account[field_name]) updates[field_name] = values[field_name] === '' ? null : minutes;
  }
  return { updates, field_errors: {} };
}

// The message after saving the email or password.
export function describe_sign_in_success(updates) {
  if (updates.password) return "Saved. You've been logged out everywhere else, so use your new password on other devices.";
  return 'Your new email is saved.';
}
