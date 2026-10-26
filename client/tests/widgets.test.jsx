import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_SAVE_DELAY_MS } from '../src/config/constants.js';
import { ThemeProvider } from '../src/context/ThemeContext.jsx';
import { render_in_router } from './helpers/render_helpers.jsx';

vi.mock('../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue('response') }));
vi.mock('../src/services/widget_service.js', async (import_original) => ({
  ...(await import_original()),
  update_widget: vi.fn(),
  order_widgets: vi.fn(),
  delete_widget: vi.fn(),
  fetch_live_widget_data: vi.fn(),
}));

const { send_authed_request } = await import('../src/services/auth_service.js');
const widget_service = await import('../src/services/widget_service.js');
const widget_utils = await import('../src/utils/widgets.js');
const { default: WidgetBlock } = await import('../src/components/widgets/WidgetBlocks.jsx');
const { default: WidgetView } = await import('../src/components/widgets/WidgetView.jsx');

// Shows one block on its own (in a router, for links) for a widget of the given shape.
function show(block, shape, extra_props = {}) {
  cleanup();
  return render_in_router(<WidgetBlock block={block} block_index={0} block_id="b" shape={shape} {...extra_props} />);
}

const CHECKLIST_WIDGET = {
  id: 'w1',
  title: 'Exam prep',
  kind: 'card',
  spec: { blocks: [{ type: 'checklist', title: 'This week', items: ['Read', 'Revise'] }] },
  state: {},
  pinned_paths: ['*'],
  layout: { width: 'small', height: null, is_collapsed: false, position: null },
};
const APP_WIDGET = {
  id: 'w2',
  title: 'Converter',
  kind: 'app',
  spec: { html: '<p>Hi</p>', height: 200 },
  state: {},
  pinned_paths: ['/dashboard/learn'],
  layout: { width: 'medium', height: null, is_collapsed: false, position: null },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('widget service', () => {
  it('calls the widget endpoints', async () => {
    const { fetch_widgets } = widget_service;
    await fetch_widgets();
    expect(send_authed_request).toHaveBeenLastCalledWith('/widgets');
    const real_service = await vi.importActual('../src/services/widget_service.js');
    await real_service.update_widget('w1', { title: 'New' });
    expect(send_authed_request).toHaveBeenLastCalledWith('/widgets/w1', { method: 'PATCH', body: { title: 'New' } });
    await real_service.order_widgets([{ type: 'widget', id: 'w2' }]);
    expect(send_authed_request).toHaveBeenLastCalledWith('/widgets/order', { method: 'PUT', body: { items: [{ type: 'widget', id: 'w2' }] } });
    await real_service.fetch_widget_stacks();
    expect(send_authed_request).toHaveBeenLastCalledWith('/widget-stacks');
    await real_service.create_widget_stack({ widget_ids: ['w1', 'w2'] });
    expect(send_authed_request).toHaveBeenLastCalledWith('/widget-stacks', { method: 'POST', body: { widget_ids: ['w1', 'w2'] } });
    await real_service.update_widget_stack('s1', { view: 'list' });
    expect(send_authed_request).toHaveBeenLastCalledWith('/widget-stacks/s1', { method: 'PATCH', body: { view: 'list' } });
    await real_service.delete_widget_stack('s1');
    expect(send_authed_request).toHaveBeenLastCalledWith('/widget-stacks/s1', { method: 'DELETE' });
    await real_service.delete_widget('w1');
    expect(send_authed_request).toHaveBeenLastCalledWith('/widgets/w1', { method: 'DELETE' });
    await real_service.fetch_live_widget_data('weak_topics', 's1');
    expect(send_authed_request).toHaveBeenLastCalledWith('/widgets/live/weak_topics?skill_id=s1');
    await real_service.fetch_live_widget_data('upcoming_events');
    expect(send_authed_request).toHaveBeenLastCalledWith('/widgets/live/upcoming_events');
  });
});

describe('widget helpers', () => {
  it('builds a locked-down page for app widgets', () => {
    const app_document = widget_utils.build_app_document('<p>Hi</p>');
    expect(app_document.indexOf('Content-Security-Policy')).toBeLessThan(app_document.indexOf('<p>Hi</p>'));
    expect(widget_utils.APP_WIDGET_POLICY).toMatch("default-src 'none'");
    expect(app_document).toMatch(/<body><script>.*<\/script><p>Hi<\/p><\/body>/);
    expect(app_document).toContain(widget_utils.APP_HEIGHT_MESSAGE);
    expect(widget_utils.build_app_document('<p>Hi</p>', 'dark')).toContain('color-scheme:dark');
  });

  it('gives app pages a see-through design kit in the widget accent, starting at the regular size', () => {
    const app_document = widget_utils.build_app_document('<p>Hi</p>', 'light', 'teal');
    expect(app_document).toContain('<html lang="en" data-size="regular">');
    expect(app_document).toContain('--accent:#0f766e');
    expect(app_document).toContain('html,body{background:transparent}');
    expect(app_document).toContain(widget_utils.APP_SHAPE_MESSAGE);
    for (const kit_class of ['.stack', '.row', '.grid', '.tile', '.big', '.label', '.muted', '.pill', 'button.secondary', 'button.ghost']) {
      expect(app_document).toContain(kit_class);
    }
    expect(app_document).toContain('html:not([data-size="compact"]) .only-compact');
    expect(widget_utils.build_app_styles('dark', 'teal')).toContain('--accent:#2dd4bf;--on-accent:#0f172a');
    expect(widget_utils.build_app_styles('light', 'not-an-accent')).toContain('--accent:#4f46e5');
  });

  it("starts the app's kit with its saved data, which can never close the script early", () => {
    const app_document = widget_utils.build_app_document('', 'light', 'indigo', { note: '</script><b>bold</b>' });
    expect(app_document).not.toContain('</script><b>');
    expect(app_document).toContain('\\u003c/script>');
    const kit_script = app_document.match(/<script>(\(function install_app_kit[\s\S]*?)<\/script>/)[1];

    // The copied kit runs on its own against a stand-in page, and starts with the saved data.
    const root = document.createElement('html');
    const app_window = { document: { documentElement: root }, parent: { postMessage: vi.fn() }, addEventListener: vi.fn() };
    new Function('window', kit_script)(app_window);
    expect(app_window.kit.load()).toEqual({ note: '</script><b>bold</b>' });
    expect(app_window.kit.calc('2+2')).toBe(4);
    expect(app_window.kit.save({ score: 3 })).toBe(true);
    expect(app_window.parent.postMessage).toHaveBeenCalledWith({ type: widget_utils.APP_SAVE_MESSAGE, state: { score: 3 } }, '*');
  });

  it('gives app pages keypads, displays, fields and segmented choices', () => {
    const styles = widget_utils.build_app_styles('dark');
    for (const kit_class of ['.display', '.keypad', '.wide', '.field', '.segmented', '[aria-pressed="true"]', '--raised:#334155']) {
      expect(styles).toContain(kit_class);
    }
  });

  it('keeps reported app heights within the limits', () => {
    expect(widget_utils.clamp_widget_height(10)).toBe(120);
    expect(widget_utils.clamp_widget_height(250.2)).toBe(251);
    expect(widget_utils.clamp_widget_height(5000)).toBe(900);
    expect(widget_utils.clamp_widget_height('tall')).toBeNull();
  });

  it('works out pages and pins', () => {
    expect(widget_utils.get_page_path('/dashboard/learn/extra')).toBe('/dashboard/learn');
    expect(widget_utils.is_pinned_here(['*'], '/dashboard/quiz')).toBe(true);
    expect(widget_utils.is_pinned_here(['/dashboard/learn', '/dashboard/quiz'], '/dashboard/quiz/x')).toBe(true);
    expect(widget_utils.is_pinned_here(['/dashboard/learn'], '/dashboard/quiz')).toBe(false);
    expect(widget_utils.is_pinned_here([], '/dashboard/quiz')).toBe(false);
    expect(widget_utils.describe_pins(['*'])).toBe('Every page');
    expect(widget_utils.describe_pins(['/dashboard/learn'])).toBe('Learn');
    expect(widget_utils.describe_pins(['/dashboard/learn', '/dashboard/quiz'])).toBe('Learn and Quiz');
    expect(widget_utils.describe_pins(['/dashboard/learn', '/dashboard/quiz', '/dashboard/schedule'])).toBe('Learn, Quiz and Schedule');
    expect(widget_utils.describe_pins([])).toBe('No pages');
    // Pages are toggled in sidebar order; taking one off every page leaves the rest.
    expect(widget_utils.toggle_pinned_page(['/dashboard/quiz'], '/dashboard/learn')).toEqual(['/dashboard/learn', '/dashboard/quiz']);
    expect(widget_utils.toggle_pinned_page(['/dashboard/learn', '/dashboard/quiz'], '/dashboard/learn')).toEqual(['/dashboard/quiz']);
    expect(widget_utils.toggle_pinned_page(['*'], '/dashboard/learn')).toEqual(widget_utils.list_dashboard_paths().filter((path) => path !== '/dashboard/learn'));
  });

  it('keeps checklist ticks in the state', () => {
    expect(widget_utils.get_checked_items({}, 0, 2)).toEqual([false, false]);
    const state = widget_utils.toggle_checked_item({ other: 1 }, 0, 1, 2);
    expect(state).toEqual({ other: 1, checked: { 0: [false, true] } });
    expect(widget_utils.toggle_checked_item(state, 0, 1, 2).checked[0]).toEqual([false, false]);
  });

  it('describes a countdown in days, hours and minutes', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    expect(widget_utils.describe_countdown('2026-10-28T16:30:00Z', now)).toEqual({ is_past: false, text: '3 days, 4 hours left' });
    expect(widget_utils.describe_countdown('2026-10-25T13:01:00Z', now).text).toBe('1 hour, 1 minute left');
    expect(widget_utils.describe_countdown('2026-10-26T12:00:00Z', now).text).toBe('1 day left');
    expect(widget_utils.describe_countdown('2026-10-25T11:00:00Z', now)).toEqual({ is_past: true, text: "It's here" });
  });
});

describe('widget blocks', () => {
  it('shows markdown, links and a countdown', () => {
    render_in_router(
      <>
        <WidgetBlock block={{ type: 'markdown', markdown: '**Bold** idea' }} block_index={0} block_id="b0" />
        <WidgetBlock block={{ type: 'links', links: [{ label: 'Learn', path: '/dashboard/learn' }] }} block_index={1} block_id="b1" />
        <WidgetBlock block={{ type: 'countdown', label: 'Exam', target: '2099-01-01T00:00:00Z' }} block_index={2} block_id="b2" />
        <WidgetBlock block={{ type: 'mystery' }} block_index={3} block_id="b3" />
      </>,
    );
    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'Learn' })).toHaveAttribute('href', '/dashboard/learn');
    // "N days left" or "N days, M hours left", depending on the time of day the test runs.
    expect(screen.getByText(/^\d+ days(, .*)? left$/)).toBeInTheDocument();
  });

  it('ticks checklist items through on_state_change', async () => {
    const on_state_change = vi.fn();
    render(<WidgetBlock block={CHECKLIST_WIDGET.spec.blocks[0]} block_index={0} block_id="c" state={{ checked: { 0: [true, false] } }} on_state_change={on_state_change} />);
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Read' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Revise' }));
    expect(on_state_change).toHaveBeenCalledWith({ checked: { 0: [true, true] } });
  });

  it('turns flashcards over and moves between them', async () => {
    const block = { type: 'flashcards', cards: [{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }] };
    render(<WidgetBlock block={block} block_index={0} block_id="f" />);
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    const card = screen.getByRole('button', { name: 'Question: Q1' });
    expect(card).toHaveAccessibleDescription('Press to see the answer.');
    await userEvent.click(card);
    expect(screen.getByRole('button', { name: 'Answer: A1' })).toHaveAccessibleDescription('Press to see the question again.');
    expect(screen.getByRole('button', { name: 'Previous card' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(screen.getByRole('button', { name: 'Question: Q2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next card' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(screen.getByRole('button', { name: 'Question: Q1' })).toBeInTheDocument();
  });

  it('lays each block out for the size and shape of its widget', async () => {
    const compact = { size: 'compact', orientation: null };
    const large = { size: 'large', orientation: null };
    const landscape = { size: 'regular', orientation: 'landscape' };
    const countdown = { type: 'countdown', label: 'Exam', target: '2099-01-01T00:00:00Z' };
    show(countdown, compact);
    expect(document.querySelectorAll('.text-display')).toHaveLength(1);
    expect(screen.getByText('days')).toBeInTheDocument();
    show(countdown, large);
    expect(screen.getByText('minutes')).toBeInTheDocument();
    show({ ...countdown, target: '2000-01-01T00:00:00Z' }, large);
    expect(screen.getAllByText("It's here")).toHaveLength(2);

    const checklist = { type: 'checklist', items: ['A', 'B', 'C', 'D'] };
    show(checklist, landscape, { state: { checked: { 0: [true] } } });
    expect(screen.getByRole('list')).toHaveClass('grid-cols-2');
    expect(screen.getByText('done', { exact: false }).parentElement).toHaveTextContent('1/4 done');
    show(checklist, compact, { state: {} });
    expect(screen.getByRole('list')).not.toHaveClass('grid-cols-2');

    const links = { type: 'links', links: [{ label: 'Learn', path: '/dashboard/learn' }] };
    show(links, compact);
    expect(screen.getByRole('list')).toHaveClass('divide-y');
    show(links, large);
    expect(screen.getByRole('link', { name: 'Learn' })).toHaveClass('rounded-full');

    show({ type: 'markdown', markdown: 'Small text' }, compact);
    expect(screen.getByText('Small text').parentElement.parentElement).toHaveClass('[&_p]:text-small');

    show({ type: 'flashcards', cards: [{ front: 'Q', back: 'A' }] }, landscape);
    expect(screen.getByRole('button', { name: 'Question: Q' })).toHaveClass('flex-1');
  });

  it('shows the first few live items when compact, and tiles when large', async () => {
    const items = ['One', 'Two', 'Three', 'Four'].map((label) => ({ label, detail: 'Biology' }));
    widget_service.fetch_live_widget_data.mockResolvedValue({ items });
    const block = { type: 'live', source: 'weak_topics' };
    const { rerender } = render_in_router(<WidgetBlock block={block} block_index={0} block_id="l" shape={{ size: 'compact', orientation: null }} />);
    expect(await screen.findByText('Three')).toBeInTheDocument();
    expect(screen.queryByText('Four')).not.toBeInTheDocument();
    rerender(<WidgetBlock block={block} block_index={0} block_id="l" shape={{ size: 'large', orientation: null }} />);
    expect(await screen.findByText('Four')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveClass('grid-cols-2');
  });

  it('loads live data, with its empty and error states', async () => {
    widget_service.fetch_live_widget_data
      .mockResolvedValueOnce({ items: [{ label: 'Cells', detail: 'Biology', link: '/dashboard/learn' }, { label: 'Exam', starts_at: '2026-10-27T09:00:00Z' }] })
      .mockResolvedValueOnce({ items: [] })
      .mockRejectedValueOnce(new Error('Skill not found'));
    const block = { type: 'live', source: 'weak_topics', skill_id: 's1' };
    const first = render_in_router(<WidgetBlock block={block} block_index={0} block_id="l" />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Cells' })).toHaveAttribute('href', '/dashboard/learn');
    expect(screen.getByText('Exam')).toBeInTheDocument();
    expect(widget_service.fetch_live_widget_data).toHaveBeenCalledWith('weak_topics', 's1');
    first.unmount();
    const second = render_in_router(<WidgetBlock block={block} block_index={0} block_id="l" />);
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
    second.unmount();
    render_in_router(<WidgetBlock block={block} block_index={0} block_id="l" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Skill not found');
  });
});

describe('WidgetView', () => {
  it('runs an app in a sandboxed frame, just the app', () => {
    render(
      <ThemeProvider>
        <WidgetView widget={APP_WIDGET} id_prefix="test" />
      </ThemeProvider>,
    );
    const app_frame = screen.getByTitle('Converter');
    expect(app_frame).toHaveAttribute('sandbox', 'allow-scripts');
    expect(app_frame.getAttribute('srcdoc')).toMatch('Content-Security-Policy');
    expect(app_frame).toHaveStyle({ height: '200px' });
    // Only its own frame may resize it, and only to a height within the limits.
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { type: widget_utils.APP_HEIGHT_MESSAGE, height: 80 } })));
    expect(app_frame).toHaveStyle({ height: '200px' });
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: widget_utils.APP_HEIGHT_MESSAGE, height: 80 }, source: app_frame.contentWindow }),
      ),
    );
    expect(app_frame).toHaveStyle({ height: '120px' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it("tells an app its widget's shape when it loads and whenever it changes, in the widget's accent", () => {
    const show_app = (shape) => (
      <ThemeProvider>
        <WidgetView widget={APP_WIDGET} id_prefix="test" shape={shape} accent="rose" />
      </ThemeProvider>
    );
    const { rerender } = render(show_app({ size: 'compact', orientation: null }));
    const app_frame = screen.getByTitle('Converter');
    expect(app_frame.getAttribute('srcdoc')).toContain('--accent:#be123c');
    const post_message = vi.spyOn(app_frame.contentWindow, 'postMessage');
    fireEvent.load(app_frame);
    expect(post_message).toHaveBeenLastCalledWith({ type: widget_utils.APP_SHAPE_MESSAGE, size: 'compact', orientation: null }, '*');
    rerender(show_app({ size: 'large', orientation: 'landscape' }));
    expect(post_message).toHaveBeenLastCalledWith({ type: widget_utils.APP_SHAPE_MESSAGE, size: 'large', orientation: 'landscape' }, '*');
  });

  it("saves an app's data from its own frame once it stops saving, and when it closes", () => {
    vi.useFakeTimers();
    const on_state_change = vi.fn();
    const saved_widget = { ...APP_WIDGET, state: { app: { count: 1 } } };
    const { unmount } = render(
      <ThemeProvider>
        <WidgetView widget={saved_widget} id_prefix="test" on_state_change={on_state_change} />
      </ThemeProvider>,
    );
    const app_frame = screen.getByTitle('Converter');
    expect(app_frame.getAttribute('srcdoc')).toContain('"state":{"count":1}');
    const save = (state, source = app_frame.contentWindow) =>
      act(() => window.dispatchEvent(new MessageEvent('message', { data: { type: widget_utils.APP_SAVE_MESSAGE, state }, source })));

    save({ count: 2 });
    save({ count: 3 });
    save({ count: 99 }, window);
    save({ text: 'x'.repeat(widget_utils.APP_STATE_MAX_LENGTH) });
    expect(on_state_change).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(APP_SAVE_DELAY_MS));
    expect(on_state_change).toHaveBeenCalledTimes(1);
    expect(on_state_change).toHaveBeenLastCalledWith({ app: { count: 3 } });
    // The page isn't rebuilt by a save, so the app keeps running.
    expect(app_frame.getAttribute('srcdoc')).toContain('"state":{"count":1}');

    save({ count: 4 });
    unmount();
    expect(on_state_change).toHaveBeenLastCalledWith({ app: { count: 4 } });
    vi.useRealTimers();
  });

  it('keeps an app at the height the student set', () => {
    render(
      <ThemeProvider>
        <WidgetView widget={APP_WIDGET} id_prefix="test" fixed_height={300} />
      </ThemeProvider>,
    );
    expect(screen.getByTitle('Converter')).toHaveStyle({ height: '300px' });
  });

  it('shows a card\'s blocks with ids for this copy', () => {
    render(<WidgetView widget={CHECKLIST_WIDGET} id_prefix="panel" on_state_change={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Read' })).toHaveAttribute('id', 'panel-w1-0-item-0');
  });
});
