import { Router } from 'express';

// /api/ai: information about the AI setup, so the app can say when it is in practice mode.
export function create_ai_router({ ai_provider, transcriber }) {
  const ai_router = Router();

  // GET /api/ai/status -> { ai_provider, transcription_provider } ("mock", "gemini", "anthropic" or "openai")
  ai_router.get('/status', function report_ai_status(req, res) {
    res.json({ ai_provider: ai_provider.name, transcription_provider: transcriber.name });
  });

  return ai_router;
}
