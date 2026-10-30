import { Router } from 'express';
import { LEARNING_QUIZ_QUESTIONS } from '../config/learning_quiz.js';

// GET /api/learning-quiz -> { questions }. Public, so the sign-up page can load it.
export function create_learning_quiz_router() {
  const learning_quiz_router = Router();

  learning_quiz_router.get('/', function read_learning_quiz(req, res) {
    res.json({ questions: LEARNING_QUIZ_QUESTIONS });
  });

  return learning_quiz_router;
}
