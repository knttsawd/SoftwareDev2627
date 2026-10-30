import { use_assistant } from '../context/AssistantContext.jsx';
import * as widget_service from '../services/widget_service.js';
import { get_item_key, list_item_widgets } from '../utils/widget_layout.js';

// records with the one whose id is record_id changed by updates.
export function update_record(records, record_id, updates) {
  return records.map((record) => (record.id === record_id ? { ...record, ...updates } : record));
}

// records with each one listed in positions (item key -> index) given that position.
export function place_records(records, type, positions) {
  return records.map((record) => {
    const key = get_item_key(type, record.id);
    return positions.has(key) ? { ...record, layout: { ...record.layout, position: positions.get(key) } } : record;
  });
}

// Everything that changes widgets and stacks, shared by every place they show. Small
// changes show at once and are saved, and are undone if saving fails; changes that reshape
// stacks wait for the server, then reload both lists. Each resolves to the error message,
// or '' when it worked.
export function use_widget_actions() {
  const { widgets_state, stacks_state } = use_assistant();

  // Shows change on list_state at once, then runs save, putting the list back if it fails.
  async function change_list(list_state, change, save) {
    const previous_records = list_state.data;
    list_state.set_data(change);
    try {
      await save();
      return '';
    } catch (save_error) {
      list_state.set_data(() => previous_records);
      return save_error.message;
    }
  }

  // Runs save, then reloads widgets and stacks so they match what the server now has.
  async function reshape(save) {
    try {
      await save();
      return '';
    } catch (save_error) {
      return save_error.message;
    } finally {
      widgets_state.reload();
      stacks_state.reload();
    }
  }

  function save_widget(widget, updates) {
    return change_list(widgets_state, (widgets) => update_record(widgets, widget.id, updates), () => widget_service.update_widget(widget.id, updates));
  }

  function save_stack(stack, updates) {
    return change_list(stacks_state, (stacks) => update_record(stacks, stack.id, updates), () => widget_service.update_widget_stack(stack.id, updates));
  }

  // Saves updates to an item: a widget or a stack.
  function save_item(item, updates) {
    return item.type === 'stack' ? save_stack(item.record, updates) : save_widget(item.record, updates);
  }

  // Saves layout changes merged into the item's layout.
  function save_layout(item, layout_changes) {
    return save_item(item, { layout: { ...item.layout, ...layout_changes } });
  }

  // Deletes a widget; a stack it was in is reloaded, since it may have been taken apart.
  async function delete_widget(widget) {
    const error = await change_list(widgets_state, (widgets) => widgets.filter((other) => other.id !== widget.id), () => widget_service.delete_widget(widget.id));
    stacks_state.reload();
    return error;
  }

  // Saves the order of the docked items on a page: each gets its index as its position.
  async function save_order(ordered_items) {
    const positions = new Map(ordered_items.map((item, position) => [item.key, position]));
    const previous_widgets = widgets_state.data;
    const previous_stacks = stacks_state.data;
    widgets_state.set_data((widgets) => place_records(widgets, 'widget', positions));
    stacks_state.set_data((stacks) => place_records(stacks, 'stack', positions));
    try {
      await widget_service.order_widgets(ordered_items.map((item) => ({ type: item.type, id: item.id })));
      return '';
    } catch (order_error) {
      widgets_state.set_data(() => previous_widgets);
      stacks_state.set_data(() => previous_stacks);
      return order_error.message;
    }
  }

  // Puts dragged and target (items) in one stack, where target is: two widgets make a new
  // stack, a widget joins a stack, and two stacks merge.
  function stack_together(target, dragged) {
    return reshape(async () => {
      const widget_ids = [...list_item_widgets(target), ...list_item_widgets(dragged)].map((widget) => widget.id);
      const placement = { pinned_paths: target.pinned_paths, layout: target.layout };
      const host = [target, dragged].find((item) => item.type === 'stack');
      if (!host) {
        await widget_service.create_widget_stack({ widget_ids, ...placement });
        return;
      }
      const other = host === target ? dragged : target;
      if (other.type === 'stack') await widget_service.delete_widget_stack(other.id);
      await widget_service.update_widget_stack(host.id, { widget_ids, ...placement });
    });
  }

  // Takes one widget out of a stack (a stack left with one widget is taken apart).
  function remove_from_stack(stack_item, widget) {
    const widget_ids = stack_item.record.widget_ids.filter((widget_id) => widget_id !== widget.id);
    return reshape(() => widget_service.update_widget_stack(stack_item.id, { widget_ids }));
  }

  // Takes a stack apart; its widgets show on their own where it was.
  function unstack(stack_item) {
    return reshape(() => widget_service.delete_widget_stack(stack_item.id));
  }

  return { save_widget, save_stack, save_item, save_layout, delete_widget, save_order, stack_together, remove_from_stack, unstack };
}
