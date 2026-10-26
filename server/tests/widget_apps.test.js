import { describe, expect, it, vi } from 'vitest';
import { AI_TASK_TIER, DEFAULT_GEMINI_MODELS, GEMINI_THINKING_LEVEL, WIDGET_HEIGHT } from '../config/constants.js';
import { create_llm_ai_provider } from '../services/ai/llm_ai_provider.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import { build_mock_widget_app, CALCULATOR_APP, CONVERTER_APP, COUNTER_APP } from '../services/ai/widget_app_examples.js';
import { APP_BUILDER_GUIDE, APP_FINAL_CHECKS, build_widget_app_request, normalize_widget_app, WIDGET_APP_JSON_SCHEMA } from '../services/ai/widget_app_prompts.js';
import { APP_BLOCKED_CODE, clean_widget_spec } from '../services/widget_specs.js';

describe('the app builder prompt', () => {
  it('asks for a whole app on the build tier, with the kit, the rules and the examples', () => {
    const request = build_widget_app_request({ title: 'Molar mass', brief: 'Works out molar mass from a formula like H2O' });
    expect(request.task_tier).toBe(AI_TASK_TIER.build);
    expect(request.json_schema).toBe(WIDGET_APP_JSON_SCHEMA);
    expect(request.system_prompt).toBe(APP_BUILDER_GUIDE);
    for (const part of ['kit.calc(', 'kit.convert(', 'kit.save(', 'eval()', 'compact', '.keypad', CALCULATOR_APP, CONVERTER_APP]) {
      expect(APP_BUILDER_GUIDE).toContain(part);
    }
    expect(request.user_prompt).toBe(`App title: Molar mass\n\nWhat it must do: Works out molar mass from a formula like H2O\n\n${APP_FINAL_CHECKS}`);
    expect(APP_FINAL_CHECKS).toMatch('compact version');
  });

  it('passes on the app being changed and what was wrong with the last try', () => {
    const { user_prompt } = build_widget_app_request({ title: 'T', brief: 'Add a memory key', current_html: '<p>now</p>', problem: 'Popups are blocked', previous_html: '<p>last</p>' });
    expect(user_prompt).toContain('This is the app now. Keep everything that works');
    expect(user_prompt).toContain('<p>now</p>');
    expect(user_prompt).toContain('Your last version was turned down: Popups are blocked');
    expect(user_prompt).toContain('The last version:\n<p>last</p>');
  });

  it('tidies the answer, or gives null without html', () => {
    expect(normalize_widget_app({ html: ' <p>x</p> ', height: 250.4, summary: ' Does x. ' })).toEqual({ html: '<p>x</p>', height: 250, summary: 'Does x.' });
    expect(normalize_widget_app({ html: '<p>x</p>' })).toEqual({ html: '<p>x</p>', height: WIDGET_HEIGHT.default, summary: '' });
    expect(normalize_widget_app({ html: '  ' })).toBeNull();
    expect(normalize_widget_app(null)).toBeNull();
  });

  it('runs on Gemini Flash with more thinking', () => {
    expect(DEFAULT_GEMINI_MODELS.build[0]).toBe('gemini-3.5-flash');
    expect(GEMINI_THINKING_LEVEL.build).toBe('MEDIUM');
  });
});

describe('building apps', () => {
  it('asks a real AI for the app and checks it came back', async () => {
    const complete_json = vi.fn().mockResolvedValueOnce({ html: '<p class="hide-compact">x</p>', height: 200, summary: 'X.' }).mockResolvedValueOnce({ html: '' });
    const ai_provider = create_llm_ai_provider('test', complete_json);
    expect(await ai_provider.build_widget_app({ title: 'X', brief: 'Show x' })).toEqual({ html: '<p class="hide-compact">x</p>', height: 200, summary: 'X.' });
    expect(complete_json.mock.calls[0][0].task_tier).toBe(AI_TASK_TIER.build);
    await expect(ai_provider.build_widget_app({ title: 'X', brief: 'Show x' })).rejects.toThrow('did not write the app');
  });

  it('makes a calculator, a converter or a counter in practice mode', async () => {
    expect(build_mock_widget_app({ title: 'Calculator', brief: 'scientific' }).html).toBe(CALCULATOR_APP);
    expect(build_mock_widget_app({ title: 'Tool', brief: 'Do some maths' }).html).toBe(CALCULATOR_APP);
    expect(build_mock_widget_app({ title: 'Units', brief: 'Convert km to miles' }).html).toBe(CONVERTER_APP);
    expect(build_mock_widget_app({ title: 'Tally', brief: 'Count laps' })).toMatchObject({ html: COUNTER_APP, summary: expect.any(String) });
    expect((await create_mock_ai_provider().build_widget_app({ title: 'Calculator', brief: '' })).html).toBe(CALCULATOR_APP);
  });

  it('writes example apps that pass every check', () => {
    for (const html of [CALCULATOR_APP, CONVERTER_APP, COUNTER_APP]) {
      expect(clean_widget_spec('app', { html, height: 300 }).error).toBeUndefined();
      expect(html).toMatch(/kit\.(calc|convert|save)/);
    }
  });
});

describe('code the sandbox blocks', () => {
  const app_with = (script) => clean_widget_spec('app', { html: `<p class="hide-compact">x</p><script>${script}</script>` });

  it('turns down code that would quietly not work, saying what to use instead', () => {
    expect(app_with('const answer = eval(text);').error).toBe(APP_BLOCKED_CODE[0].problem);
    expect(app_with('const run = new Function("return 1");').error).toMatch('kit.calc');
    expect(app_with('localStorage.setItem("x", 1);').error).toMatch('kit.save');
    expect(app_with('fetch("https://example.com");').error).toMatch('no network');
    expect(app_with('new XMLHttpRequest();').error).toMatch('no network');
    expect(app_with('window.alert("hi");').error).toMatch('Popups');
    expect(app_with('if (confirm("Sure?")) go();').error).toMatch('Popups');
    expect(app_with('setTimeout("tick()", 10);').error).toMatch('a function, not a string');
  });

  it('counts sizing done in the script with kit.on_size as a compact version', () => {
    expect(clean_widget_spec('app', { html: '<p>x</p><script>kit.on_size(redraw);</script>' }).error).toBeUndefined();
  });

  it('lets similar but safe code through', () => {
    for (const script of ['const evaluated = evaluate(x);', 'quiz.confirm(answer);', 'show_prompt();', 'setTimeout(tick, 10);', 'const fetched = 1;']) {
      expect(app_with(script).error).toBeUndefined();
    }
  });
});
