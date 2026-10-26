import { send_authed_request } from './auth_service.js';

// The student's progress bars and improvement metrics:
// { skills, quiz_scores, study_minutes, recent_work_blocks, topic_changes, teaching, totals }.
// Each metric with a period is { recent, previous, change, period_days }.
export async function fetch_progress() {
  return send_authed_request('/progress');
}
