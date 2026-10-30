// Small preferences kept on this device only (the last skill chosen, the theme, a
// dismissed reminder). Browsers that block storage (private modes, blocked site data)
// throw on access; then nothing is remembered and every read gives null.

export function read_device_value(storage_key) {
  try {
    return window.localStorage.getItem(storage_key);
  } catch {
    return null;
  }
}

export function save_device_value(storage_key, value) {
  try {
    window.localStorage.setItem(storage_key, value);
  } catch {
    // Storage is unavailable, so the preference lasts only until the page closes.
  }
}
