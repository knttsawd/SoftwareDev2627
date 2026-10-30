import { beforeEach, describe, expect, it, vi } from 'vitest';
import { build_learn_path, LEARN_PARAMS } from '../../src/utils/study_paths.js';

vi.mock('../../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue('response') }));

const { send_authed_request } = await import('../../src/services/auth_service.js');
const learning_service = await import('../../src/services/learning_service.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('learning_service', () => {
  it('calls the learning path and guided lesson endpoints', async () => {
    await learning_service.fetch_learning_path('s1');
    await learning_service.build_learning_path('s1');
    await learning_service.fetch_guided_lessons('s1');
    await learning_service.start_guided_lesson('s1', { topic_id: 't1', step_count: 4 });
    await learning_service.fetch_guided_lesson('l1');
    await learning_service.answer_lesson_check('l1', 2);
    await learning_service.reteach_lesson_step('l1');
    await learning_service.go_to_next_step('l1');
    await learning_service.delete_guided_lesson('l1');

    expect(send_authed_request.mock.calls).toEqual([
      ['/skills/s1/learning-path'],
      ['/skills/s1/learning-path', { method: 'POST' }],
      ['/skills/s1/guided-lessons'],
      ['/skills/s1/guided-lessons', { method: 'POST', body: { topic_id: 't1', step_count: 4 } }],
      ['/guided-lessons/l1'],
      ['/guided-lessons/l1/answer', { method: 'POST', body: { choice_index: 2 } }],
      ['/guided-lessons/l1/reteach', { method: 'POST' }],
      ['/guided-lessons/l1/next', { method: 'POST' }],
      ['/guided-lessons/l1', { method: 'DELETE' }],
    ]);
  });

  it('calls the practice endpoints', async () => {
    await learning_service.fetch_practice_sets('s1');
    await learning_service.create_practice_set('s1', { topic: 'Cells', problem_count: 2 });
    await learning_service.fetch_practice_set('p1');
    await learning_service.show_practice_hint('p1', 0);
    await learning_service.show_practice_solution('p1', 1);
    await learning_service.check_practice_answer('p1', 0, '6');
    await learning_service.delete_practice_set('p1');

    expect(send_authed_request.mock.calls).toEqual([
      ['/skills/s1/practice-sets'],
      ['/skills/s1/practice-sets', { method: 'POST', body: { topic: 'Cells', problem_count: 2 } }],
      ['/practice-sets/p1'],
      ['/practice-sets/p1/problems/0/hint', { method: 'POST' }],
      ['/practice-sets/p1/problems/1/solution', { method: 'POST' }],
      ['/practice-sets/p1/problems/0/check', { method: 'POST', body: { answer: '6' } }],
      ['/practice-sets/p1', { method: 'DELETE' }],
    ]);
  });

  it('calls the reading, key term and explain endpoints', async () => {
    await learning_service.fetch_reading_list('s1');
    await learning_service.fetch_reading('r1');
    await learning_service.fetch_reading_section('r1', 2);
    await learning_service.guide_reading_section('r1', 2);
    await learning_service.save_reading_position('r1', 2);
    await learning_service.explain_reading_passage('r1', 2, 'stomata');
    await learning_service.fetch_glossary('s1');
    await learning_service.add_glossary_term('s1', { term: 'Osmosis', definition: 'Water moving.' });
    await learning_service.generate_glossary('s1');
    await learning_service.delete_glossary_term('s1', 'g1');
    await learning_service.explain_another_way('s1', { text: 'Cells', style: 'simpler' });

    expect(send_authed_request.mock.calls).toEqual([
      ['/skills/s1/reading'],
      ['/resources/r1/reading'],
      ['/resources/r1/reading/sections/2'],
      ['/resources/r1/reading/sections/2/guide', { method: 'POST' }],
      ['/resources/r1/reading/position', { method: 'PUT', body: { section_index: 2 } }],
      ['/resources/r1/reading/explain', { method: 'POST', body: { section_index: 2, passage: 'stomata' } }],
      ['/skills/s1/glossary'],
      ['/skills/s1/glossary', { method: 'POST', body: { term: 'Osmosis', definition: 'Water moving.' } }],
      ['/skills/s1/glossary/generate', { method: 'POST' }],
      ['/skills/s1/glossary/g1', { method: 'DELETE' }],
      ['/skills/s1/explain', { method: 'POST', body: { text: 'Cells', style: 'simpler' } }],
    ]);
  });
});

describe('build_learn_path', () => {
  it('builds Learn page addresses, leaving out empty values', () => {
    expect(build_learn_path({ skill_id: 's1', tab: 'practice', topic_id: 't 1' })).toBe('/dashboard/learn?skill=s1&tab=practice&topic=t+1');
    expect(build_learn_path({ skill_id: 's1', lesson_id: 'l1' })).toBe('/dashboard/learn?skill=s1&lesson=l1');
    expect(build_learn_path({ resource_id: 'r1', practice_id: 'p1' })).toBe('/dashboard/learn?practice=p1&read=r1');
    expect(build_learn_path({})).toBe('/dashboard/learn');
    expect(LEARN_PARAMS.read).toBe('read');
  });
});
