import { Router } from 'express';

// GET /api/health: lets Render (and you) confirm the server is up.
export function create_health_router() {
  const health_router = Router();

  health_router.get('/', function report_health(req, res) {
    res.json({ status: 'ok' });
  });

  return health_router;
}
