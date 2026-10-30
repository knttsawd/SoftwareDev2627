import { Router } from 'express';
import { get_progress } from '../services/progress_service.js';

// /api/progress: the student's progress bars and improvement metrics. Behind require_auth.
export function create_progress_router({ database }) {
  const progress_router = Router();

  // GET -> { skills, quiz_scores, study_minutes, recent_work_blocks, topic_changes, teaching, totals }
  // (see services/progress_service.js get_progress)
  progress_router.get('/', function read_progress(req, res) {
    res.json(get_progress(database, req.user_id));
  });

  return progress_router;
}
