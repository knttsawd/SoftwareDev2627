import { vi } from 'vitest';
import { create_mock_transcriber } from '../../services/ai/ai_providers.js';
import { create_mock_ai_provider } from '../../services/ai/mock_ai_provider.js';
import { create_skill } from '../../services/skill_service.js';
import { create_test_account } from './test_accounts.js';

// A few paragraphs of study material, long enough for the mock AI to make notes and quizzes.
export const SAMPLE_STUDY_TEXT = [
  'Photosynthesis is the process plants use to turn light energy into chemical energy stored in glucose.',
  'Chlorophyll inside the chloroplasts absorbs sunlight, mostly red and blue light, and reflects green light.',
  'During photosynthesis, plants take in carbon dioxide through small pores called stomata on their leaves.',
  'Water travels from the roots through the xylem and is split during the light reactions, releasing oxygen.',
  'The Calvin cycle uses energy carriers from the light reactions to build glucose from carbon dioxide.',
  'Cellular respiration later releases the energy stored in glucose so cells can grow and repair themselves.',
].join('\n\n');

// Creates the test student plus one skill, returning { user_id, skill }.
export async function create_student_with_skill(database, skill_name = 'Biology') {
  const { id: user_id } = await create_test_account(database);
  return { user_id, skill: create_skill(database, user_id, { name: skill_name }) };
}

// Adds a ready resource row straight to the database (no extraction), for tests that only
// need a skill to have study text. topic_id optionally files it under a map topic.
export function insert_test_resource(
  database,
  { user_id, skill_id, title = 'Chapter 1', text = SAMPLE_STUDY_TEXT, topic_id = null },
) {
  const resource_id = `resource-${Math.random().toString(36).slice(2)}`;
  database
    .prepare(
      "INSERT INTO resources (id, user_id, skill_id, skill_node_id, title, resource_type, extracted_text, status) VALUES (?, ?, ?, ?, ?, 'note', ?, 'ready')",
    )
    .run(resource_id, user_id, skill_id, topic_id, title, text);
  return resource_id;
}

// The mock AI and transcriber, with every method wrapped in a spy so tests can check calls.
export function create_spied_ai() {
  const ai_provider = create_mock_ai_provider();
  const transcriber = create_mock_transcriber();
  vi.spyOn(ai_provider, 'generate_notes');
  vi.spyOn(ai_provider, 'generate_quiz');
  vi.spyOn(transcriber, 'transcribe');
  return { ai_provider, transcriber };
}
