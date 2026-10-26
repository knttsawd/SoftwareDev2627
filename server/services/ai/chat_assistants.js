import { CHAT_ASSISTANTS } from '../../config/chat_assistants.js';
import { create_named_ai_provider } from './ai_providers.js';

// Which API key each real provider needs before it can be offered.
const PROVIDER_KEY_FIELDS = { gemini: 'gemini_api_key', anthropic: 'anthropic_api_key', openai: 'openai_api_key' };

// True when the server can run this provider: practice mode always, the main AI_PROVIDER
// always (its SDK may find credentials itself), and any other provider with a key set.
export function is_provider_available(provider_name, ai_config) {
  if (provider_name === 'mock' || provider_name === ai_config.provider) return true;
  return Boolean(ai_config[PROVIDER_KEY_FIELDS[provider_name]]);
}

// The choice of AIs that can run the assistant, built once at startup from the "ai" part
// of read_env(). Returns:
//   options                [{ id, label, description }] the student can choose from
//   default_id             used when the student hasn't chosen (the main AI_PROVIDER's first option)
//   resolve_assistant_id(id)  id if it is on offer, otherwise default_id (e.g. a key was removed)
//   plan_step(id, step_request)  one step of the assistant's work with that AI; step_request
//                          is described in assistant_prompts.build_assistant_step_request
// build_provider is injectable for tests.
export function create_chat_assistants(ai_config, build_provider = create_named_ai_provider) {
  const available_assistants = CHAT_ASSISTANTS.filter((assistant) => is_provider_available(assistant.provider, ai_config));
  const providers_by_name = new Map();
  for (const { provider } of available_assistants) {
    if (!providers_by_name.has(provider)) providers_by_name.set(provider, build_provider(provider, ai_config));
  }
  const default_id = (
    available_assistants.find((assistant) => assistant.provider === ai_config.provider) ?? available_assistants[0]
  ).id;

  function resolve_assistant_id(requested_id) {
    return available_assistants.some((assistant) => assistant.id === requested_id) ? requested_id : default_id;
  }

  async function plan_step(assistant_id, step_request) {
    const chosen_id = resolve_assistant_id(assistant_id);
    const assistant = available_assistants.find((candidate) => candidate.id === chosen_id);
    return providers_by_name.get(assistant.provider).plan_assistant_step({ ...step_request, task_tier: assistant.task_tier });
  }

  return {
    options: available_assistants.map(({ id, label, description }) => ({ id, label, description })),
    default_id,
    resolve_assistant_id,
    plan_step,
  };
}
