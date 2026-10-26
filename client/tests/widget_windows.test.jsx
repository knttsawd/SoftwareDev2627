import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WIDGET_LOOK, STACK_SCROLL_SETTLE_MS, WIDGET_EDGE_MARGIN_PX, WIDGET_LOOK_SAVE_DELAY_MS } from '../src/config/constants.js';
import { render_in_router } from './helpers/render_helpers.jsx';

vi.mock('../src/services/widget_service.js', () => ({
  fetch_widgets: vi.fn(),
  fetch_widget_stacks: vi.fn(),
  update_widget: vi.fn(),
  order_widgets: vi.fn(),
  delete_widget: vi.fn(),
  fetch_live_widget_data: vi.fn(),
  create_widget_stack: vi.fn(),
  update_widget_stack: vi.fn(),
  delete_widget_stack: vi.fn(),
}));

const widget_service = await import('../src/services/widget_service.js');
const { AssistantProvider, use_assistant } = await import('../src/context/AssistantContext.jsx');
const { default: WidgetShelf } = await import('../src/components/widgets/WidgetShelf.jsx');
const { default: FloatingWidgets } = await import('../src/components/widgets/FloatingWidgets.jsx');
const { default: WidgetWindow, format_size_badge, pick_item_icon } = await import('../src/components/widgets/WidgetWindow.jsx');
const { place_menu } = await import('../src/components/widgets/WidgetMenu.jsx');
const { find_stack_item, to_widget_item } = await import('../src/utils/widget_layout.js');

const LAYOUT = {
  width: 'small',
  height: null,
  is_collapsed: false,
  position: null,
  mode: 'docked',
  anchor: 'screen',
  x: null,
  y: null,
  float_width: null,
  float_height: null,
  content_size: 'auto',
  is_hidden: false,
  ...DEFAULT_WIDGET_LOOK,
};

// A card widget pinned to every page, with layout changes.
function create_card(id, title, layout_changes = {}) {
  return {
    id,
    title,
    kind: 'card',
    spec: { blocks: [{ type: 'markdown', markdown: `${title} notes` }] },
    state: {},
    pinned_paths: ['*'],
    layout: { ...LAYOUT, ...layout_changes },
  };
}

const NOTES = create_card('w1', 'Notes', { position: 0 });
const TIMER = create_card('w2', 'Timer', { position: 1 });
const PLAN = create_card('w3', 'Plan', { position: 2 });
const STACK = { id: 's1', widget_ids: ['w2', 'w3'], view: 'swipe', active_widget_id: 'w2', pinned_paths: ['*'], layout: { ...LAYOUT, position: 1 } };
const WIDE_WINDOW = { matchMedia: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) };
const NARROW_WINDOW = { matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) };
const VIEWPORT = { innerWidth: 1000, innerHeight: 800, addEventListener: vi.fn(), removeEventListener: vi.fn() };

// The widgets in the assistant panel's Widgets tab: each in a "panel" window.
function PanelWidgets() {
  const { widgets_state, stacks_state } = use_assistant();
  const widgets = widgets_state.data ?? [];
  return widgets.map((widget) => (
    <WidgetWindow
      key={widget.id}
      item={to_widget_item(widget)}
      placement="panel"
      id_prefix="panel"
      stack_item={find_stack_item(stacks_state.data ?? [], widgets, widget.id)}
    />
  ));
}

// The shelf and the floating layer on the quiz page, with these widgets and stacks.
async function render_page({ widgets, stacks = [], media_window = WIDE_WINDOW }) {
  widget_service.fetch_widgets.mockResolvedValue(widgets);
  widget_service.fetch_widget_stacks.mockResolvedValue(stacks);
  const rendered = render_in_router(
    <AssistantProvider>
      <WidgetShelf media_window={media_window} />
      <FloatingWidgets media_window={media_window} viewport_window={VIEWPORT} />
      <PanelWidgets />
    </AssistantProvider>,
    { initial_path: '/dashboard/quiz' },
  );
  // The page's windows download lazily; the panel's copies don't.
  await waitFor(() => expect(document.querySelector('[data-item-key] [data-drag-handle]')).not.toBeNull());
  return rendered;
}

// A floating window, once the floating layer has loaded it.
async function find_floating_window(title) {
  let floating_window;
  await waitFor(() => {
    floating_window = find_window(title, 'floating');
    expect(floating_window).toBeTruthy();
  });
  return floating_window;
}

// A window on the page (not its copy in the panel), found by its title.
function find_window(title, placement = 'shelf') {
  const region = placement === 'shelf' ? screen.getByRole('region', { name: 'Your pinned widgets' }) : document.querySelector('.pointer-events-none.absolute');
  return within(region)
    .getAllByRole('group', { name: title })
    .find((group) => group.dataset.itemKey);
}

// The title bar of a window: what's dragged to move it.
function find_title_bar(window_element) {
  return window_element.firstElementChild;
}

// The page's windows' titles, in order.
function list_shelf_titles() {
  return [...screen.getByRole('region', { name: 'Your pinned widgets' }).querySelectorAll('[data-item-key]')].map((element) => element.getAttribute('aria-label'));
}

// Opens a window's ⋯ menu.
async function open_menu(window_element, title) {
  await userEvent.click(within(window_element).getByRole('button', { name: `Options for ${title}` }));
  return within(window_element).getByRole('group', { name: `Options for ${title}` });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const save of [widget_service.update_widget, widget_service.update_widget_stack, widget_service.order_widgets, widget_service.delete_widget]) {
    save.mockResolvedValue({});
  }
});

afterEach(() => {
  delete document.elementsFromPoint;
  vi.useRealTimers();
});

describe('docked widgets', () => {
  it('shows the docked items for this page in order, stacks included', async () => {
    await render_page({ widgets: [NOTES, TIMER, PLAN, create_card('w4', 'Elsewhere', {})].map((widget) => (widget.id === 'w4' ? { ...widget, pinned_paths: ['/dashboard/learn'] } : widget)), stacks: [STACK] });
    expect(list_shelf_titles()).toEqual(['Notes', 'Timer']);
    expect(within(find_window('Timer')).getByText('in this stack', { exact: false }).parentElement).toHaveTextContent('1/2 in this stack');
    expect(find_window('Notes')).toHaveClass('xl:col-span-2', 'bg-surface');
    expect(find_window('Notes')).toHaveAttribute('data-accent', 'indigo');
  });

  it('moves items with the grip keys and the menu, saving the order with each item type', async () => {
    await render_page({ widgets: [NOTES, TIMER, PLAN], stacks: [STACK] });

    within(find_window('Notes')).getByRole('button', { name: 'Move Notes' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(widget_service.order_widgets).toHaveBeenLastCalledWith([
      { type: 'stack', id: 's1' },
      { type: 'widget', id: 'w1' },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Notes moved to place 2 of 2.');
    expect(list_shelf_titles()).toEqual(['Timer', 'Notes']);
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(widget_service.order_widgets).toHaveBeenCalledTimes(1);

    const menu = await open_menu(find_window('Notes'), 'Notes');
    expect(within(menu).getByRole('button', { name: 'Move later' })).toBeDisabled();
    await userEvent.click(within(menu).getByRole('button', { name: 'Move earlier' }));
    expect(list_shelf_titles()).toEqual(['Notes', 'Timer']);
  });

  it('puts the order back when saving it fails', async () => {
    widget_service.order_widgets.mockRejectedValue(new Error('Offline'));
    await render_page({ widgets: [NOTES, TIMER] });
    within(find_window('Timer')).getByRole('button', { name: 'Move Timer' }).focus();
    await userEvent.keyboard('{Home}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(list_shelf_titles()).toEqual(['Notes', 'Timer']);
  });

  it('follows the pointer while dragged by its title bar, and drops beside or onto another item', async () => {
    widget_service.create_widget_stack.mockResolvedValue({});
    await render_page({ widgets: [NOTES, TIMER, PLAN] });
    const notes = find_window('Notes');
    const plan = find_window('Plan');
    vi.spyOn(plan, 'getBoundingClientRect').mockReturnValue({ left: 400, top: 0, width: 200, height: 100 });
    document.elementsFromPoint = vi.fn(() => [within(notes).getByText('Notes notes'), plan]);

    // Pressing a button in the title bar doesn't start a drag.
    fireEvent.pointerDown(within(notes).getByRole('button', { name: 'Notes' }), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(find_title_bar(notes), { clientX: 200, clientY: 10 });
    expect(notes.style.transform).toBe('');

    fireEvent.pointerDown(find_title_bar(notes), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(find_title_bar(notes), { clientX: 590, clientY: 50 });
    expect(notes.style.transform).toBe('translate(580px, 40px) scale(1.02)');
    expect(document.body.dataset.dragging).toBe('true');
    expect(plan.className).toMatch('after:bg-brand-600');
    fireEvent.pointerUp(find_title_bar(notes), { clientX: 590, clientY: 50 });
    expect(document.body.dataset.dragging).toBeUndefined();
    expect(widget_service.order_widgets).toHaveBeenLastCalledWith([
      { type: 'widget', id: 'w2' },
      { type: 'widget', id: 'w3' },
      { type: 'widget', id: 'w1' },
    ]);

    // Dropped on the middle of Plan, the two are stacked where Plan is.
    document.elementsFromPoint = vi.fn(() => [plan]);
    const timer_bar = find_title_bar(find_window('Timer'));
    fireEvent.pointerDown(timer_bar, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(timer_bar, { clientX: 500, clientY: 50 });
    expect(plan).toHaveClass('ring-2');
    fireEvent.pointerUp(timer_bar, { clientX: 500, clientY: 50 });
    await waitFor(() =>
      // Plan is second after the drop above, and the stack takes its place.
      expect(widget_service.create_widget_stack).toHaveBeenCalledWith({ widget_ids: ['w3', 'w2'], pinned_paths: ['*'], layout: { ...PLAN.layout, position: 1 } }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Stacked Timer with Plan.');

    // Over nothing, or after a cancel, nothing moves.
    document.elementsFromPoint = vi.fn(() => []);
    fireEvent.pointerDown(timer_bar, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(timer_bar, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(timer_bar, { clientX: 20, clientY: 20 });
    document.elementsFromPoint = vi.fn(() => [plan]);
    fireEvent.pointerDown(timer_bar, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(timer_bar, { clientX: 590, clientY: 50 });
    fireEvent.pointerCancel(timer_bar, {});
    expect(widget_service.order_widgets).toHaveBeenCalledTimes(1);
  });

  it('resizes from its right edge, bottom edge and corner, showing the size while dragging', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function measure_width() {
      return this.dataset.itemKey ? 200 : 600;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
    await render_page({ widgets: [NOTES] });
    const notes = find_window('Notes');

    const right_edge = notes.querySelector('[data-resize="e"]');
    fireEvent.pointerDown(right_edge, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(right_edge, { clientX: 200, clientY: 300 });
    expect(notes).toHaveClass('xl:col-span-4');
    expect(within(notes).getByText('Large · auto')).toBeInTheDocument();
    fireEvent.pointerUp(right_edge, { clientX: 200, clientY: 300 });
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, width: 'large' } });
    expect(screen.getByRole('status')).toHaveTextContent('Notes: Large, fits its content.');

    const bottom_edge = notes.querySelector('[data-resize="s"]');
    fireEvent.pointerDown(bottom_edge, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(bottom_edge, { clientX: 500, clientY: 60 });
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, width: 'large', height: 160 } });
    expect(document.getElementById('shelf-w1-content')).toHaveStyle({ height: '160px' });

    const corner = within(notes).getByRole('button', { name: 'Resize Notes' });
    corner.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowUp}{Enter}');
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, width: 'full', height: 120 } });

    fireEvent.pointerDown(corner, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(corner, { clientX: -400, clientY: 0 });
    fireEvent.pointerCancel(corner, {});
    expect(notes).toHaveClass('md:col-span-6');
  });

  it('only changes the height on narrow screens', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
    await render_page({ widgets: [NOTES], media_window: NARROW_WINDOW });
    within(find_window('Notes')).getByRole('button', { name: 'Resize Notes' }).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');
    expect(widget_service.update_widget).toHaveBeenCalledTimes(1);
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, height: 140 } });
    expect(within(find_window('Notes')).queryByRole('button', { name: 'Float Notes' })).not.toBeInTheDocument();
  });

  it('folds items away one at a time or all at once', async () => {
    await render_page({ widgets: [NOTES, TIMER] });
    await userEvent.click(within(find_window('Notes')).getByRole('button', { name: 'Notes' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, is_collapsed: true } });
    expect(within(find_window('Notes')).queryByRole('button', { name: 'Resize Notes' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w2', { layout: { ...TIMER.layout, is_collapsed: true } });
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(widget_service.update_widget).toHaveBeenCalledTimes(4);
  });
});

describe('the ⋯ menu', () => {
  it('sets the size from the menu', async () => {
    await render_page({ widgets: [{ ...NOTES, layout: { ...NOTES.layout, height: 200 } }] });
    const notes = find_window('Notes');
    const menu = await open_menu(notes, 'Notes');

    await userEvent.click(within(within(menu).getByRole('group', { name: 'Size' })).getByRole('radio', { name: 'Medium' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, height: 200, width: 'medium' } });
    await userEvent.click(within(menu).getByRole('button', { name: 'Fit height to content' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, width: 'medium', height: null } });
  });

  it('customizes the look live in its panel, saving once changes settle and when it closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await render_page({ widgets: [NOTES] });
    const notes = find_window('Notes');
    await userEvent.click(within(await open_menu(notes, 'Notes')).getByRole('button', { name: 'Customize…' }));
    const sheet = screen.getByRole('dialog', { name: 'Customize' });
    expect(within(sheet).getByRole('button', { name: 'Done' })).toHaveFocus();
    expect(within(sheet).queryByLabelText('Opacity')).not.toBeInTheDocument();

    // Every change shows at once; nothing is saved until the changes stop.
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Glass' }));
    expect(notes).toHaveClass('widget-glass');
    expect(notes.querySelector('.widget-glass-pane')).toBeInTheDocument();
    expect(notes.querySelector('.widget-glass-rim')).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Opacity'), { target: { value: '60' } });
    await userEvent.click(within(within(sheet).getByRole('group', { name: 'Glass tint' })).getByRole('radio', { name: 'Accent' }));
    expect(notes.style.getPropertyValue('--glass-fill')).toBe('color-mix(in oklab, var(--widget-accent) 60%, transparent)');
    fireEvent.change(within(sheet).getByLabelText('Frost'), { target: { value: '4' } });
    fireEvent.change(within(sheet).getByLabelText('Colour boost'), { target: { value: '150' } });
    expect(notes.style.getPropertyValue('--glass-filter')).toBe('blur(4px) saturate(150%)');
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Teal' }));
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Extra round' }));
    await userEvent.click(within(within(sheet).getByRole('group', { name: 'Shadow' })).getByRole('radio', { name: 'Deep' }));
    await userEvent.click(within(within(sheet).getByRole('group', { name: 'Content size' })).getByRole('radio', { name: 'Small' }));
    expect(notes).toHaveAttribute('data-accent', 'teal');
    expect(notes).toHaveAttribute('data-shadow', 'deep');
    expect(notes).toHaveAttribute('data-size', 'compact');
    expect(notes.style.getPropertyValue('--widget-radius')).toBe('30px');
    expect(widget_service.update_widget).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(WIDGET_LOOK_SAVE_DELAY_MS));
    expect(widget_service.update_widget).toHaveBeenCalledTimes(1);
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', {
      layout: {
        ...NOTES.layout,
        appearance: 'glass',
        glass_opacity: 60,
        glass_tint: 'accent',
        glass_frost: 4,
        glass_vibrance: 150,
        accent: 'teal',
        corners: 'extra',
        shadow: 'deep',
        content_size: 'compact',
      },
    });

    // Reset look keeps the style and accent; Done saves straight away and closes.
    await userEvent.click(within(sheet).getByRole('button', { name: 'Reset look' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(widget_service.update_widget).toHaveBeenCalledTimes(2);
    expect(widget_service.update_widget.mock.calls[1][1].layout).toMatchObject({ ...DEFAULT_WIDGET_LOOK, appearance: 'glass', accent: 'teal', content_size: 'compact' });
    expect(screen.queryByRole('dialog', { name: 'Customize' })).not.toBeInTheDocument();
    expect(within(notes).getByRole('button', { name: 'Options for Notes' })).toHaveFocus();
  }, 15_000);

  it('shows on a choice of pages, and hides without deleting', async () => {
    await render_page({ widgets: [NOTES] });
    const notes = find_window('Notes');
    let menu = await open_menu(notes, 'Notes');
    expect(within(menu).getByText('Shows on: Every page.')).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: 'Customize…' }));
    const sheet = screen.getByRole('dialog', { name: 'Customize' });
    // Taking one page off "every page" leaves all the others.
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Learn' }));
    const without_learn = widget_service.update_widget.mock.calls.at(-1)[1].pinned_paths;
    expect(without_learn).toContain('/dashboard/quiz');
    expect(without_learn).not.toContain('/dashboard/learn');
    expect(within(sheet).getByRole('checkbox', { name: 'Every page' })).not.toBeChecked();
    expect(within(sheet).getByRole('checkbox', { name: 'Learn' })).not.toBeChecked();
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Every page' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { pinned_paths: ['*'] });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));

    menu = await open_menu(notes, 'Notes');
    await userEvent.click(within(menu).getByRole('button', { name: 'Hide' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, is_hidden: true } });
    // Its only widget hidden, the page has no pinned widgets left.
    expect(screen.queryByRole('region', { name: 'Your pinned widgets' })).toBeNull();
    // It stays in the Widgets tab, labelled, ready to show again.
    const panel_notes = document.getElementById('panel-w1-content').parentElement;
    expect(within(panel_notes).getByText('Hidden')).toBeInTheDocument();
    menu = await open_menu(panel_notes, 'Notes');
    expect(within(menu).getByText('Hidden from every page.')).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: 'Show on its pages' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, is_hidden: false } });
    expect(find_window('Notes')).toBeInTheDocument();
  });

  it('measures itself, laying its content out for its width and, with a set height, its shape', async () => {
    // A stand-in that lets the test report each watched element's size.
    const watched = new Map();
    vi.stubGlobal(
      'ResizeObserver',
      class FakeResizeObserver {
        constructor(on_resize) {
          this.on_resize = on_resize;
        }
        observe(element) {
          watched.set(element, this.on_resize);
        }
        disconnect() {}
      },
    );
    await render_page({ widgets: [{ ...NOTES, layout: { ...NOTES.layout, height: 200 } }] });
    const notes = find_window('Notes');
    const report_size = (width, height) => watched.get(document.getElementById('shelf-w1-content'))([{ contentRect: { width, height } }]);
    act(() => report_size(600, 200));
    expect(notes).toHaveAttribute('data-size', 'large');
    expect(notes).toHaveAttribute('data-orientation', 'landscape');
    act(() => report_size(200, 300));
    expect(notes).toHaveAttribute('data-size', 'compact');
    expect(notes).toHaveAttribute('data-orientation', 'portrait');
    expect(document.getElementById('shelf-w1-content')).toHaveClass('px-3');
    vi.unstubAllGlobals();
  });

  it('shows an icon for the kind of widget in its title bar', () => {
    const card_item = (block_type) => ({ type: 'widget', record: { kind: 'card', spec: { blocks: [{ type: block_type }] } } });
    expect(pick_item_icon({ type: 'stack' })).not.toBe(pick_item_icon(card_item('markdown')));
    expect(pick_item_icon({ type: 'widget', record: { kind: 'app', spec: {} } })).not.toBe(pick_item_icon(card_item('checklist')));
    expect(pick_item_icon(card_item('mystery'))).toBe(pick_item_icon(card_item('markdown')));
    expect(pick_item_icon({ type: 'widget', record: { kind: 'card', spec: { blocks: [] } } })).toBe(pick_item_icon(card_item('markdown')));
  });

  it('opens upward from a window near the bottom of the screen', async () => {
    await render_page({ widgets: [NOTES] });
    const menu_button = within(find_window('Notes')).getByRole('button', { name: 'Options for Notes' });
    vi.spyOn(menu_button, 'getBoundingClientRect').mockReturnValue({ top: window.innerHeight - 40, bottom: window.innerHeight - 10 });
    await userEvent.click(menu_button);
    expect(within(find_window('Notes')).getByRole('group', { name: 'Options for Notes' })).toHaveClass('bottom-full');
  });

  it('closes with Escape without closing anything around it, and with a click outside', async () => {
    const outside_escape = vi.fn();
    window.addEventListener('keydown', outside_escape);
    await render_page({ widgets: [NOTES] });
    const notes = find_window('Notes');
    await open_menu(notes, 'Notes');
    await userEvent.keyboard('{Escape}');
    expect(within(notes).getByRole('button', { name: 'Options for Notes' })).toHaveFocus();
    expect(outside_escape).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outside_escape);

    await open_menu(notes, 'Notes');
    await userEvent.click(document.body);
    expect(within(notes).queryByRole('group', { name: 'Options for Notes' })).not.toBeInTheDocument();
  });

  it('renames, and deletes after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await render_page({ widgets: [NOTES] });
    const notes = find_window('Notes');

    let menu = await open_menu(notes, 'Notes');
    await userEvent.clear(within(menu).getByLabelText('Title'));
    await userEvent.type(within(menu).getByLabelText('Title'), 'Week notes{Enter}');
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { title: 'Week notes' });

    menu = await open_menu(find_window('Week notes'), 'Week notes');
    await userEvent.click(within(menu).getByRole('button', { name: 'Delete widget' }));
    expect(widget_service.delete_widget).not.toHaveBeenCalled();
    menu = await open_menu(find_window('Week notes'), 'Week notes');
    await userEvent.click(within(menu).getByRole('button', { name: 'Delete widget' }));
    expect(widget_service.delete_widget).toHaveBeenCalledWith('w1');
    expect(widget_service.fetch_widget_stacks).toHaveBeenCalledTimes(2);
  });

  it('stacks a widget with another item on the page', async () => {
    widget_service.create_widget_stack.mockResolvedValue({});
    await render_page({ widgets: [NOTES, TIMER] });
    const menu = await open_menu(find_window('Notes'), 'Notes');
    await userEvent.selectOptions(within(menu).getByLabelText('Stack with'), 'widget:w2');
    await waitFor(() => expect(widget_service.create_widget_stack).toHaveBeenCalledWith({ widget_ids: ['w1', 'w2'], pinned_paths: ['*'], layout: NOTES.layout }));
    expect(widget_service.fetch_widgets).toHaveBeenCalledTimes(2);
  });

  it('shows what went wrong when stacking fails', async () => {
    widget_service.create_widget_stack.mockRejectedValue(new Error('"Timer" is already in a stack'));
    await render_page({ widgets: [NOTES, TIMER] });
    const menu = await open_menu(find_window('Notes'), 'Notes');
    await userEvent.selectOptions(within(menu).getByLabelText('Stack with'), 'widget:w2');
    expect(await within(find_window('Notes')).findByRole('alert')).toHaveTextContent('already in a stack');
  });

  it('says floating needs a wider window on narrow screens', async () => {
    await render_page({ widgets: [{ ...NOTES, layout: { ...NOTES.layout, mode: 'floating' } }], media_window: NARROW_WINDOW });
    const menu = await open_menu(find_window('Notes'), 'Notes');
    expect(within(menu).getByText(/Floating needs a wider window/)).toBeInTheDocument();
    expect(within(menu).getByRole('radio', { name: 'On screen' })).toBeChecked();
  });
});

describe('floating widgets', () => {
  const FLOATING_NOTES = { ...NOTES, layout: { ...NOTES.layout, mode: 'floating' } };

  it('floats from the title bar button, and opens near the top right of the screen', async () => {
    await render_page({ widgets: [NOTES] });
    await userEvent.click(within(find_window('Notes')).getByRole('button', { name: 'Float Notes' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, mode: 'floating' } });
    expect(screen.getByRole('status')).toHaveTextContent('Notes is floating now.');

    const notes = await find_floating_window('Notes');
    expect(notes).toHaveStyle({ position: 'fixed', left: '644px', top: '96px', width: '340px' });
    expect(screen.queryByRole('region', { name: 'Your pinned widgets' })).not.toBeInTheDocument();
    await userEvent.click(within(notes).getByRole('button', { name: 'Dock Notes' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, mode: 'docked' } });
  });

  it('moves by its title bar and settles against an edge when let go near it', async () => {
    await render_page({ widgets: [FLOATING_NOTES] });
    const notes = find_window('Notes', 'floating');
    const title_bar = find_title_bar(notes);

    fireEvent.pointerDown(title_bar, { clientX: 700, clientY: 100 });
    fireEvent.pointerMove(title_bar, { clientX: 300, clientY: 400 });
    expect(notes).toHaveStyle({ left: '244px', top: '396px' });
    fireEvent.pointerUp(title_bar, { clientX: 300, clientY: 400 });
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...FLOATING_NOTES.layout, x: 244, y: 396 } });

    fireEvent.pointerDown(title_bar, { clientX: 300, clientY: 400 });
    fireEvent.pointerUp(title_bar, { clientX: 70, clientY: 390 });
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...FLOATING_NOTES.layout, x: WIDGET_EDGE_MARGIN_PX, y: 386 } });

    // A press without a move saves nothing; arrows on the grip move it a step.
    fireEvent.pointerDown(title_bar, { clientX: 300, clientY: 400 });
    fireEvent.pointerUp(title_bar, { clientX: 300, clientY: 400 });
    expect(widget_service.update_widget).toHaveBeenCalledTimes(2);
    within(notes).getByRole('button', { name: 'Move Notes' }).focus();
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...FLOATING_NOTES.layout, x: WIDGET_EDGE_MARGIN_PX, y: 362 } });
  });

  it('resizes from any edge or corner, and with the corner keys', async () => {
    await render_page({ widgets: [FLOATING_NOTES] });
    const notes = find_window('Notes', 'floating');

    const left_edge = notes.querySelector('[data-resize="w"]');
    fireEvent.pointerDown(left_edge, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(left_edge, { clientX: -100, clientY: 0 });
    expect(within(notes).getByText('440 × auto')).toBeInTheDocument();
    expect(notes).toHaveStyle({ left: '544px', width: '440px' });
    fireEvent.pointerUp(left_edge, { clientX: -100, clientY: 0 });
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', {
      layout: { ...FLOATING_NOTES.layout, x: 544, y: 96, float_width: 440, float_height: null },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Notes: 440 by fits its content.');

    const top_edge = notes.querySelector('[data-resize="n"]');
    fireEvent.pointerDown(top_edge, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(top_edge, { clientX: 0, clientY: -200 });
    expect(widget_service.update_widget.mock.lastCall[1].layout.float_height).toBe(200);

    within(notes).getByRole('button', { name: 'Resize Notes' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(widget_service.update_widget.mock.lastCall[1].layout).toMatchObject({ float_width: 480, float_height: 200 });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(widget_service.update_widget.mock.lastCall[1].layout).toMatchObject({ float_width: 480, float_height: 240 });

    const menu = await open_menu(notes, 'Notes');
    await userEvent.click(within(menu).getByRole('button', { name: 'Reset size' }));
    expect(widget_service.update_widget.mock.lastCall[1].layout).toMatchObject({ float_width: null, float_height: null });
  });

  it('stays on the page or on screen, and comes to the front when touched', async () => {
    await render_page({
      widgets: [
        { ...FLOATING_NOTES, layout: { ...FLOATING_NOTES.layout, anchor: 'page', x: 10, y: 20 } },
        { ...TIMER, layout: { ...TIMER.layout, mode: 'floating', x: 500, y: 200 } },
      ],
    });
    const notes = find_window('Notes', 'floating');
    const timer = find_window('Timer', 'floating');
    expect(notes).toHaveStyle({ position: 'absolute' });
    expect([notes.style.zIndex, timer.style.zIndex]).toEqual(['1', '1']);

    fireEvent.pointerDown(timer);
    expect(timer.style.zIndex).toBe('2');
    fireEvent.pointerDown(notes);
    expect([notes.style.zIndex, timer.style.zIndex]).toEqual(['3', '2']);
    fireEvent.pointerDown(notes);
    expect(notes.style.zIndex).toBe('3');

    const menu = await open_menu(notes, 'Notes');
    await userEvent.click(within(menu).getByRole('radio', { name: 'On screen' }));
    expect(widget_service.update_widget.mock.lastCall[1].layout).toMatchObject({ anchor: 'screen' });
    expect(notes).toHaveStyle({ position: 'fixed' });
  });
});

describe('smart stacks', () => {
  it('swipes between widgets with the dots and arrows, and saves the one it lands on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await render_page({ widgets: [NOTES, TIMER, PLAN], stacks: [STACK] });
    const stack = find_window('Timer');
    expect(within(stack).getByRole('button', { name: 'Show Timer' })).toHaveAttribute('aria-current', 'true');
    expect(within(stack).getByRole('button', { name: 'Previous widget' })).toBeDisabled();

    fireEvent.click(within(stack).getByRole('button', { name: 'Next widget' }));
    await waitFor(() => expect(widget_service.update_widget_stack).toHaveBeenLastCalledWith('s1', { active_widget_id: 'w3' }));
    const plan_stack = find_window('Plan');
    fireEvent.click(within(plan_stack).getByRole('button', { name: 'Show Timer' }));
    await waitFor(() => expect(widget_service.update_widget_stack).toHaveBeenLastCalledWith('s1', { active_widget_id: 'w2' }));

    const track = within(find_window('Timer')).getByRole('group', { name: 'Timer, 1 of 2' }).parentElement;
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 300 });
    track.scrollLeft = 300;
    fireEvent.scroll(track);
    fireEvent.scroll(track);
    act(() => vi.advanceTimersByTime(STACK_SCROLL_SETTLE_MS));
    await waitFor(() => expect(widget_service.update_widget_stack).toHaveBeenLastCalledWith('s1', { active_widget_id: 'w3' }));
    vi.useRealTimers();
  });

  it('shows a list of titles to pick from, and changes its view from the menu', async () => {
    await render_page({ widgets: [TIMER, PLAN], stacks: [{ ...STACK, view: 'list' }] });
    const stack = find_window('Timer');
    expect(within(stack).getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true');
    expect(within(stack).getByRole('tabpanel')).toHaveTextContent('Timer notes');
    await userEvent.click(within(stack).getByRole('tab', { name: 'Plan' }));
    expect(within(find_window('Plan')).getByRole('tabpanel')).toHaveTextContent('Plan notes');

    const menu = await open_menu(find_window('Plan'), 'Plan');
    await userEvent.click(within(menu).getByRole('radio', { name: 'Swipe' }));
    expect(widget_service.update_widget_stack).toHaveBeenLastCalledWith('s1', { view: 'swipe' });
  });

  it('takes a widget out, or the whole stack apart, from its menu', async () => {
    widget_service.update_widget_stack.mockResolvedValue({ stack: null });
    widget_service.delete_widget_stack.mockResolvedValue(null);
    await render_page({ widgets: [TIMER, PLAN], stacks: [STACK] });

    let menu = await open_menu(find_window('Timer'), 'Timer');
    await userEvent.click(within(menu).getByRole('button', { name: 'Take out "Timer"' }));
    expect(widget_service.update_widget_stack).toHaveBeenLastCalledWith('s1', { widget_ids: ['w3'] });

    menu = await open_menu(find_window('Timer'), 'Timer');
    await userEvent.click(within(menu).getByRole('button', { name: 'Unstack all' }));
    expect(widget_service.delete_widget_stack).toHaveBeenCalledWith('s1');
    await waitFor(() => expect(widget_service.fetch_widget_stacks).toHaveBeenCalledTimes(3));
  });

  it('merges two stacks dropped on each other, and adds a widget dropped on a stack', async () => {
    widget_service.delete_widget_stack.mockResolvedValue(null);
    const other_stack = { ...STACK, id: 's2', widget_ids: ['w1', 'w4'], active_widget_id: 'w1', layout: { ...LAYOUT, position: 0 } };
    await render_page({ widgets: [NOTES, TIMER, PLAN, create_card('w4', 'Goals')], stacks: [STACK, other_stack] });
    const timer_stack = find_window('Timer');
    vi.spyOn(timer_stack, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 200 });
    document.elementsFromPoint = vi.fn(() => [timer_stack]);

    const notes_bar = find_title_bar(find_window('Notes'));
    fireEvent.pointerDown(notes_bar, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(notes_bar, { clientX: 150, clientY: 100 });
    fireEvent.pointerUp(notes_bar, { clientX: 150, clientY: 100 });
    await waitFor(() =>
      expect(widget_service.update_widget_stack).toHaveBeenCalledWith('s1', { widget_ids: ['w2', 'w3', 'w1', 'w4'], pinned_paths: ['*'], layout: STACK.layout }),
    );
    expect(widget_service.delete_widget_stack).toHaveBeenCalledWith('s2');
  });

  it('adds a widget to a stack dropped on it', async () => {
    await render_page({ widgets: [NOTES, TIMER, PLAN], stacks: [STACK] });
    const timer_stack = find_window('Timer');
    vi.spyOn(timer_stack, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 200 });
    document.elementsFromPoint = vi.fn(() => [timer_stack]);
    const notes_bar = find_title_bar(find_window('Notes'));
    fireEvent.pointerDown(notes_bar, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(notes_bar, { clientX: 150, clientY: 100 });
    fireEvent.pointerUp(notes_bar, { clientX: 150, clientY: 100 });
    await waitFor(() =>
      expect(widget_service.update_widget_stack).toHaveBeenCalledWith('s1', { widget_ids: ['w2', 'w3', 'w1'], pinned_paths: ['*'], layout: STACK.layout }),
    );
    expect(widget_service.delete_widget_stack).not.toHaveBeenCalled();
  });
});

describe('widgets in the assistant panel', () => {
  it('folds away just for now, and offers taking a stacked widget out of its stack', async () => {
    widget_service.update_widget_stack.mockResolvedValue({ stack: null });
    await render_page({ widgets: [NOTES, TIMER, PLAN], stacks: [{ ...STACK, pinned_paths: ['/dashboard/learn'] }] });
    const panel_notes = document.getElementById('panel-w1-content').parentElement;
    await userEvent.click(within(panel_notes).getByRole('button', { name: 'Notes' }));
    expect(within(panel_notes).getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-expanded', 'false');
    expect(widget_service.update_widget).not.toHaveBeenCalled();
    expect(within(panel_notes).queryByRole('button', { name: 'Move Notes' })).not.toBeInTheDocument();

    const panel_timer = document.getElementById('panel-w2-content').parentElement;
    const menu = await open_menu(panel_timer, 'Timer');
    expect(within(menu).getByText('In a stack on Learn.')).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Customize…' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('group', { name: 'Layout' })).not.toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: 'Take out of the stack' }));
    expect(widget_service.update_widget_stack).toHaveBeenCalledWith('s1', { widget_ids: ['w3'] });
  });
});

describe('everything else a window does', () => {
  const CHECKLIST = {
    ...create_card('w5', 'Checklist', { position: 3 }),
    spec: { blocks: [{ type: 'checklist', items: ['Read', 'Revise'] }] },
  };

  it('saves ticks in a stack and on their own, undoing one that fails to save', async () => {
    widget_service.update_widget.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Offline'));
    await render_page({ widgets: [{ ...CHECKLIST, id: 'w6', title: 'Stacked list' }, PLAN, CHECKLIST], stacks: [{ ...STACK, widget_ids: ['w6', 'w3'], active_widget_id: 'w6' }] });

    await userEvent.click(within(find_window('Stacked list')).getByRole('checkbox', { name: 'Read' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w6', { state: { checked: { 0: [true, false] } } });

    const checklist = find_window('Checklist');
    await userEvent.click(within(checklist).getByRole('checkbox', { name: 'Read' }));
    expect(await within(checklist).findByRole('alert')).toHaveTextContent('Offline');
    expect(within(checklist).getByRole('checkbox', { name: 'Read' })).not.toBeChecked();
  });

  it('floats from the menu, moves later from the menu, and goes back with the previous arrow', async () => {
    await render_page({ widgets: [NOTES, TIMER, PLAN], stacks: [{ ...STACK, active_widget_id: 'w3' }] });
    let menu = await open_menu(find_window('Notes'), 'Notes');
    await userEvent.click(within(menu).getByRole('button', { name: 'Move later' }));
    expect(widget_service.order_widgets).toHaveBeenLastCalledWith([
      { type: 'stack', id: 's1' },
      { type: 'widget', id: 'w1' },
    ]);
    // Moving keeps the menu open, to move again.
    menu = within(find_window('Notes')).getByRole('group', { name: 'Options for Notes' });
    await userEvent.click(within(menu).getByRole('radio', { name: 'Floating' }));
    expect(widget_service.update_widget).toHaveBeenLastCalledWith('w1', { layout: { ...NOTES.layout, position: 1, mode: 'floating' } });

    await userEvent.click(within(find_window('Plan')).getByRole('button', { name: 'Previous widget' }));
    expect(widget_service.update_widget_stack).toHaveBeenLastCalledWith('s1', { active_widget_id: 'w2' });
  });

  it('keeps floating windows in view when the browser window is resized', async () => {
    const viewport = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 800 });
    widget_service.fetch_widgets.mockResolvedValue([{ ...NOTES, layout: { ...NOTES.layout, mode: 'floating' } }]);
    widget_service.fetch_widget_stacks.mockResolvedValue([]);
    render_in_router(
      <AssistantProvider>
        <FloatingWidgets media_window={WIDE_WINDOW} viewport_window={viewport} />
      </AssistantProvider>,
    );
    const notes = await find_floating_window('Notes');
    expect(notes).toHaveStyle({ left: '644px' });
    viewport.innerWidth = 800;
    act(() => viewport.dispatchEvent(new Event('resize')));
    expect(notes).toHaveStyle({ left: '444px' });
  });
});

describe('small helpers', () => {
  it('opens a menu where there is room, upward near the bottom of the window', () => {
    expect(place_menu({ top: 100, bottom: 130 }, 900)).toEqual({ opens_up: false, max_height: 754 });
    expect(place_menu({ top: 700, bottom: 730 }, 900)).toEqual({ opens_up: true, max_height: 684 });
    expect(place_menu({ top: 50, bottom: 80 }, 200)).toEqual({ opens_up: false, max_height: 200 });
  });

  it('badges a size', () => {
    expect(format_size_badge({ ...LAYOUT, width: 'large', height: 300 }, false)).toBe('Large · 300 px');
    expect(format_size_badge({ ...LAYOUT, float_width: 500, float_height: 260 }, true)).toBe('500 × 260');
  });
});
