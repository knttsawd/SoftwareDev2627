import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LearningQuizReminder from '../src/components/LearningQuizReminder.jsx';
import LoadingScreen from '../src/components/LoadingScreen.jsx';
import AppearanceSettings from '../src/components/settings/AppearanceSettings.jsx';
import { QUIZ_REMINDER_DISMISSED_KEY, SELECTED_SKILL_STORAGE_KEY, THEME_STORAGE_KEY } from '../src/config/constants.js';
import { AUTH_STATUS } from '../src/context/AuthContext.jsx';
import { ConfirmProvider, use_confirm } from '../src/context/ConfirmContext.jsx';
import { ThemeProvider, use_theme } from '../src/context/ThemeContext.jsx';
import { use_remembered_skill } from '../src/hooks/use_remembered_skill.js';
import { get_path_area } from '../src/layouts/RootLayout.jsx';
import { read_device_value, save_device_value } from '../src/utils/device_storage.js';
import { find_selected_skill } from '../src/utils/skill_selection.js';
import { apply_theme, read_theme_choice, resolve_theme } from '../src/utils/theme.js';
import { create_auth_value, render_in_router } from './helpers/render_helpers.jsx';
import { NEW_ACCOUNT } from './helpers/test_data.js';

const SKILLS = [
  { id: 's1', name: 'Biology' },
  { id: 's2', name: 'Spanish' },
];

// A window whose "prefers dark" setting tests can flip, like a device switching to dark mode.
function create_media_window(prefers_dark) {
  const media_list = Object.assign(new EventTarget(), { matches: prefers_dark });
  return {
    media_list,
    matchMedia: () => media_list,
    set_prefers_dark(next_value) {
      media_list.matches = next_value;
      media_list.dispatchEvent(new Event('change'));
    },
  };
}

// A delete button that asks first, as the app's lists do, and says what was answered.
function DeleteButton() {
  const confirm = use_confirm();
  async function handle_click() {
    const is_confirmed = await confirm({ title: 'Delete this note?', message: 'It is deleted.', confirm_label: 'Delete' });
    document.body.dataset.answer = String(is_confirmed);
  }
  return (
    <button type="button" onClick={handle_click}>
      Delete note
    </button>
  );
}

describe('ConfirmProvider', () => {
  it('asks in a styled popup with Cancel focused, and answers with the button pressed', async () => {
    render(
      <ConfirmProvider>
        <DeleteButton />
      </ConfirmProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    const popup = screen.getByRole('dialog', { name: 'Delete this note?' });
    expect(popup).toHaveTextContent('It is deleted.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.body.dataset.answer).toBe('false');

    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(document.body.dataset.answer).toBe('true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.body.dataset.answer).toBe('false');
  });

  it("falls back to the browser's box outside the provider", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DeleteButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(window.confirm).toHaveBeenCalledWith('It is deleted.');
    expect(document.body.dataset.answer).toBe('true');
  });
});

describe('themes', () => {
  it('reads the saved choice, works out light or dark, and applies it', () => {
    expect(read_theme_choice()).toBe('system');
    save_device_value(THEME_STORAGE_KEY, 'purple');
    expect(read_theme_choice()).toBe('system');
    save_device_value(THEME_STORAGE_KEY, 'dark');
    expect(read_theme_choice()).toBe('dark');

    expect([resolve_theme('system', true), resolve_theme('system', false), resolve_theme('light', true)]).toEqual(['dark', 'light', 'light']);
    const root_element = document.createElement('div');
    apply_theme('dark', root_element);
    expect(root_element.dataset.theme).toBe('dark');
  });

  it('follows the device, a choice in Settings, and a change in another tab', async () => {
    const media_window = create_media_window(false);
    render(
      <ThemeProvider media_window={media_window}>
        <AppearanceSettings />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('radio', { name: 'Match my device' })).toBeChecked();

    act(() => media_window.set_prefers_dark(true));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(read_device_value(THEME_STORAGE_KEY)).toBe('light');

    save_device_value(THEME_STORAGE_KEY, 'dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY })));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'other_key' })));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('throws a clear error outside ThemeProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => use_theme())).toThrow('use_theme must be used inside ThemeProvider');
  });
});

describe('remembered choices', () => {
  it('opens on the skill in the address, else the last one chosen, else the first', () => {
    expect(find_selected_skill(SKILLS, null)).toBe(SKILLS[0]);
    expect(find_selected_skill([], null)).toBeNull();

    const { rerender } = renderHook(({ skill_id }) => use_remembered_skill(skill_id), { initialProps: { skill_id: undefined } });
    expect(read_device_value(SELECTED_SKILL_STORAGE_KEY)).toBeNull();
    rerender({ skill_id: 's2' });
    expect(find_selected_skill(SKILLS, null)).toBe(SKILLS[1]);
    expect(find_selected_skill(SKILLS, 's1')).toBe(SKILLS[0]);
    expect(find_selected_skill(SKILLS, 'gone')).toBe(SKILLS[1]);
  });

  it('remembers nothing, without failing, when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    expect(() => save_device_value('key', 'value')).not.toThrow();
    expect(read_device_value('key')).toBeNull();
  });

  it('hides the learning style quiz reminder after "Not now"', async () => {
    const auth_value = create_auth_value({ status: AUTH_STATUS.signed_in, account: NEW_ACCOUNT });
    render_in_router(<LearningQuizReminder />, { auth_value });

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(read_device_value(QUIZ_REMINDER_DISMISSED_KEY)).toBe('true');
  });
});

describe('moving between pages', () => {
  it('names the part of the site a path is in', () => {
    expect(['/', '/login', '/dashboard/quiz', '/signup/learning-style'].map(get_path_area)).toEqual(['', 'login', 'dashboard', 'signup']);
  });

  it('can show the loading animation in place instead of over the whole screen', () => {
    render(<LoadingScreen is_full_screen={false} />);
    expect(screen.getByRole('status')).not.toHaveClass('fixed');
  });
});
