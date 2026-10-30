import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGET_LAYOUT, IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { move_pinned_paths } from '../db/migrations.js';
import { build_mock_assistant_step } from '../services/ai/mock_assistant.js';
import { ASSISTANT_RULES, COMMON_SENSE_RULES } from '../services/ai/assistant_prompts.js';
import { default_pinned_paths, pick_layout_changes, to_pinned_paths, WIDGET_GUIDE } from '../services/assistant/widget_tools.js';
import { clean_widget_block, validate_widget_layout } from '../services/widget_specs.js';

describe('widget looks', () => {
  it('starts every widget with the default look, shown and on no page', () => {
    expect(DEFAULT_WIDGET_LAYOUT).toMatchObject({
      is_hidden: false,
      corners: 'round',
      shadow: 'soft',
      glass_tint: 'neutral',
      glass_opacity: 25,
      glass_frost: 8,
      glass_bend: 50,
      glass_vibrance: 100,
    });
  });

  it('keeps look numbers whole and within their limits, and checks the choices', () => {
    const { layout } = validate_widget_layout({ glass_opacity: 140.6, glass_frost: -3, glass_bend: 33.4, glass_vibrance: 20, tint_strength: 12, corners: 'extra', shadow: 'none', glass_tint: 'accent', is_hidden: true });
    expect(layout).toMatchObject({ glass_opacity: 90, glass_frost: 0, glass_bend: 33, glass_vibrance: 100, tint_strength: 12, corners: 'extra', shadow: 'none', glass_tint: 'accent', is_hidden: true });
    expect(validate_widget_layout({ glass_opacity: 'clear' }).error).toBe('glass_opacity must be a number');
    expect(validate_widget_layout({ corners: 'sharp' }).error).toMatch('Corners must be one of');
    expect(validate_widget_layout({ is_hidden: 'yes' }).error).toBe('is_hidden must be true or false');
  });
});

describe('timer blocks', () => {
  it('keep a label and a whole number of seconds, from 1 second to a day', () => {
    expect(clean_widget_block({ type: 'timer', label: ' Focus ', seconds: 1800.4 })).toEqual({ type: 'timer', label: 'Focus', seconds: 1800 });
    expect(clean_widget_block({ type: 'timer', label: 'Long', seconds: 999_999 }).seconds).toBe(86_400);
    expect(clean_widget_block({ type: 'timer', label: 'Short', seconds: 0 }).seconds).toBe(1);
    expect(clean_widget_block({ type: 'timer', label: 'No length' })).toBeNull();
    expect(clean_widget_block({ type: 'timer', seconds: 60 })).toBeNull();
  });
});

describe('moving older files to page lists', () => {
  it('copies each one-page pin into a list once, and leaves new files alone', () => {
    const database = open_database(IN_MEMORY_DATABASE);
    move_pinned_paths(database);
    database.exec('ALTER TABLE widgets ADD COLUMN pinned_path TEXT');
    database.exec("INSERT INTO users (id, first_name, last_name, username, email, password_hash) VALUES ('u1', 'A', 'B', 'abc', 'a@b.c', 'x')");
    const insert = database.prepare("INSERT INTO widgets (id, user_id, title, kind, spec, pinned_path) VALUES (?, 'u1', 'W', 'card', '{}', ?)");
    insert.run('w1', '/dashboard/learn');
    insert.run('w2', null);
    move_pinned_paths(database);
    const rows = database.prepare('SELECT id, pinned_path, pinned_paths FROM widgets ORDER BY id').all();
    expect(rows.map((row) => ({ ...row }))).toEqual([
      { id: 'w1', pinned_path: null, pinned_paths: '["/dashboard/learn"]' },
      { id: 'w2', pinned_path: null, pinned_paths: '[]' },
    ]);
    // Unpinned later, it stays unpinned when the server starts again.
    database.exec("UPDATE widgets SET pinned_paths = '[]' WHERE id = 'w1'");
    move_pinned_paths(database);
    expect(database.prepare("SELECT pinned_paths FROM widgets WHERE id = 'w1'").get().pinned_paths).toBe('[]');
  });
});

describe('the assistant and widgets', () => {
  it('reads where to pin from pin_to, defaulting to the page the student is on', () => {
    expect(to_pinned_paths('*')).toEqual(['*']);
    expect(to_pinned_paths(['/dashboard/learn', '/dashboard/quiz'])).toEqual(['/dashboard/learn', '/dashboard/quiz']);
    expect(to_pinned_paths(null)).toEqual([]);
    expect(default_pinned_paths('/dashboard/learn/topic?x=1')).toEqual(['/dashboard/learn']);
    expect(default_pinned_paths('/dashboard')).toEqual([]);
    expect(default_pinned_paths(undefined)).toEqual([]);
  });

  it('passes look settings and hiding through to the layout', () => {
    expect(pick_layout_changes({ hidden: true, glass_opacity: 10, corners: 'subtle', stays: 'page', title: 'x' })).toEqual({
      is_hidden: true,
      glass_opacity: 10,
      corners: 'subtle',
      anchor: 'page',
    });
  });

  it('tells the AI to use common sense, and when a timer fits', () => {
    expect(ASSISTANT_RULES.startsWith('You are the assistant')).toBe(true);
    expect(ASSISTANT_RULES).toContain(COMMON_SENSE_RULES);
    expect(COMMON_SENSE_RULES).toMatch('Never show days for something that lasts 30 minutes');
    expect(WIDGET_GUIDE).toMatch('"make me a 30 minute countdown" -> create_widget');
    expect(WIDGET_GUIDE).toMatch('"seconds": 1800');
  });

  it('makes a timer in practice mode when asked for a length of time', () => {
    const plan = (message) => build_mock_assistant_step({ message, step_results: [], skills: [], current_skill_id: null, now: new Date() }).tool_calls;
    expect(plan('make me a 30 minute countdown')).toEqual([
      { tool: 'create_widget', arguments: { title: '30 minutes timer', kind: 'card', blocks: [{ type: 'timer', label: '30 minutes', seconds: 1800 }], width: 'small' } },
    ]);
    expect(plan('start a timer for 2 hours')[0].arguments.blocks[0].seconds).toBe(7200);
    expect(plan('timer for 1 min')[0].arguments.blocks[0]).toEqual({ type: 'timer', label: '1 minute', seconds: 60 });
  });
});

describe('describing widgets to the AI', () => {
  it('shows a glass or tinted look with its current values', async () => {
    const { describe_widget_line } = await import('../services/assistant/assistant_context.js');
    const widget = { id: 'w1', title: 'Essay', kind: 'card', pinned_paths: ['/dashboard/learn'], layout: { ...DEFAULT_WIDGET_LAYOUT, appearance: 'glass' } };
    expect(describe_widget_line(widget)).toBe('- Essay (id w1, card, on /dashboard/learn, docked, glass: opacity 25, frost 8, bend 50, boost 100)');
    expect(describe_widget_line({ ...widget, layout: { ...widget.layout, appearance: 'tinted' } })).toBe('- Essay (id w1, card, on /dashboard/learn, docked, tinted 10%)');
    expect(WIDGET_GUIDE).toMatch('Glass starts at glass_opacity 25');
  });
});

describe('app scripts', () => {
  it('turns down an app whose script would not even parse, saying why', async () => {
    const { clean_widget_spec, find_script_error } = await import('../services/widget_specs.js');
    expect(find_script_error('<p class="hide-compact">x</p><script>const ok = /^[0-9.+\\-*/^()%!]$/;</script>')).toBeNull();
    expect(find_script_error('<script>const broken = /^[0-9.+\\\\-/*^()%!]$/;</script>')).toMatch(/^The script has a syntax error \(Invalid regular expression/);
    expect(find_script_error('<script>go(</script><script>fine()</script>')).toMatch('syntax error');
    expect(clean_widget_spec('app', { html: '<p class="hide-compact">x</p><script>if (</script>' }).error).toMatch('syntax error');
  });
});
