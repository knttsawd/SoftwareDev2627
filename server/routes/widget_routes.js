import { Router } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { assert_no_field_errors, create_http_error } from '../services/http_error.js';
import { delete_widget, get_live_widget_data, get_owned_widget, list_widgets, order_layout_items, update_widget } from '../services/widget_service.js';
import { validate_widget_order, validate_widget_updates } from '../services/widget_specs.js';

// /api/widgets: the widgets the assistant made (services/widget_service.js). Behind
// require_auth. Widgets are made and rebuilt by the assistant; the student can rename,
// pin, tick off, lay out (size, fold away, reorder) and delete them here.
export function create_widget_router({ database }) {
  const widget_router = Router();

  // GET -> [widget], newest first
  widget_router.get('/', function read_widgets(req, res) {
    res.json(list_widgets(database, req.user_id));
  });

  // GET /live/:source?skill_id= -> { source, items: [{ label, detail, starts_at?, link? }] }
  widget_router.get('/live/:source', function read_live_data(req, res) {
    res.json(get_live_widget_data(database, req.user_id, { source: req.params.source, skill_id: req.query.skill_id || null }));
  });

  // PUT /order { items: [{ type: "widget" | "stack", id }] } -> 204, with each item's
  // layout.position set to its index
  widget_router.put('/order', function reorder_widgets(req, res) {
    const order_error = validate_widget_order(req.body);
    if (order_error) throw create_http_error(HTTP_STATUS.bad_request, order_error);
    order_layout_items(database, req.user_id, req.body.items);
    res.status(HTTP_STATUS.no_content).end();
  });

  // PATCH /:id { title?, state?, pinned_paths?, layout? } -> the updated widget. layout is
  // merged: any of DEFAULT_WIDGET_LAYOUT's settings.
  widget_router.patch('/:widget_id', function edit_widget(req, res) {
    const widget = get_owned_widget(database, req.user_id, req.params.widget_id);
    const { spec, ...student_updates } = req.body ?? {};
    const { field_errors, values } = validate_widget_updates(student_updates, widget.kind, widget.layout);
    assert_no_field_errors(field_errors);
    res.json(update_widget(database, req.user_id, widget.id, values));
  });

  // DELETE /:id -> 204
  widget_router.delete('/:widget_id', function remove_widget(req, res) {
    delete_widget(database, req.user_id, req.params.widget_id);
    res.status(HTTP_STATUS.no_content).end();
  });

  return widget_router;
}
