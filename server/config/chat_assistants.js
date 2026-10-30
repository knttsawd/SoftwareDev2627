import { AI_TASK_TIER } from './constants.js';

// The AIs a student can pick to run the assistant. Only the ones the server can actually
// run are offered (see services/ai/chat_assistants.js).
//   id         saved in users.assistant_id
//   provider   an AI_PROVIDER_NAMES entry
//   task_tier  which of the provider's models to use (only Gemini has more than one)
export const CHAT_ASSISTANTS = [
  {
    id: 'gemini-quick',
    provider: 'gemini',
    task_tier: AI_TASK_TIER.light,
    label: 'Gemini Flash-Lite (quick)',
    description: 'Fast and uses the least of your Gemini quota. Good for questions and simple tasks.',
  },
  {
    id: 'gemini-thorough',
    provider: 'gemini',
    task_tier: AI_TASK_TIER.standard,
    label: 'Gemini Flash (thorough)',
    description: 'More careful with harder questions and tasks with several steps, like building widgets. Uses more quota.',
  },
  {
    id: 'claude',
    provider: 'anthropic',
    task_tier: AI_TASK_TIER.standard,
    label: 'Claude',
    description: "Anthropic's model. Clear, careful explanations.",
  },
  {
    id: 'chatgpt',
    provider: 'openai',
    task_tier: AI_TASK_TIER.standard,
    label: 'ChatGPT',
    description: "OpenAI's model.",
  },
  {
    id: 'practice',
    provider: 'mock',
    task_tier: AI_TASK_TIER.light,
    label: 'Practice mode (no AI)',
    description: 'Understands simple requests (open a page, make a skill, quiz me on a topic) and quotes your resources. Free and works offline.',
  },
];
