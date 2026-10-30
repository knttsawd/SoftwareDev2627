import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/auth_service.js', () => ({ send_authed_request: vi.fn().mockResolvedValue('response') }));

const { send_authed_request } = await import('../../src/services/auth_service.js');
const skill_service = await import('../../src/services/skill_service.js');
const resource_service = await import('../../src/services/resource_service.js');
const study_material_service = await import('../../src/services/study_material_service.js');

beforeEach(() => {
  send_authed_request.mockClear();
});

// Each row: [description, call, expected path, expected request options].
const REQUEST_CASES = [
  ['fetch_skills', () => skill_service.fetch_skills(), '/skills', undefined],
  ['create_skill', () => skill_service.create_skill({ name: 'Biology' }), '/skills', { method: 'POST', body: { name: 'Biology' } }],
  ['update_skill', () => skill_service.update_skill('s1', { color: '#000000' }), '/skills/s1', { method: 'PATCH', body: { color: '#000000' } }],
  ['delete_skill', () => skill_service.delete_skill('s1'), '/skills/s1', { method: 'DELETE' }],
  ['fetch_resources', () => resource_service.fetch_resources('s1'), '/skills/s1/resources', undefined],
  [
    'add_resource_link',
    () => resource_service.add_resource_link('s1', { url: 'https://example.com' }),
    '/skills/s1/resources/links',
    { method: 'POST', body: { url: 'https://example.com' } },
  ],
  [
    'add_resource_text',
    () => resource_service.add_resource_text('s1', { title: 'Notes', text: 'text' }),
    '/skills/s1/resources/text',
    { method: 'POST', body: { title: 'Notes', text: 'text' } },
  ],
  [
    'move_resource_to_topic',
    () => resource_service.move_resource_to_topic('r1', 't1'),
    '/resources/r1',
    { method: 'PATCH', body: { topic_id: 't1' } },
  ],
  ['delete_resource', () => resource_service.delete_resource('r1'), '/resources/r1', { method: 'DELETE' }],
  ['fetch_notes', () => study_material_service.fetch_notes('s1'), '/skills/s1/notes', undefined],
  ['generate_notes', () => study_material_service.generate_notes('s1', 'Cells'), '/skills/s1/notes', { method: 'POST', body: { topic: 'Cells' } }],
  ['delete_note', () => study_material_service.delete_note('n1'), '/notes/n1', { method: 'DELETE' }],
  ['fetch_quizzes', () => study_material_service.fetch_quizzes('s1'), '/skills/s1/quizzes', undefined],
  [
    'generate_quiz',
    () => study_material_service.generate_quiz('s1', { topic: 'Cells', question_count: 5 }),
    '/skills/s1/quizzes',
    { method: 'POST', body: { topic: 'Cells', question_count: 5 } },
  ],
  ['fetch_quiz', () => study_material_service.fetch_quiz('q1'), '/quizzes/q1', undefined],
  ['delete_quiz', () => study_material_service.delete_quiz('q1'), '/quizzes/q1', { method: 'DELETE' }],
  ['fetch_ai_status', () => study_material_service.fetch_ai_status(), '/ai/status', undefined],
];

describe('study services', () => {
  it.each(REQUEST_CASES)('%s calls the right endpoint', async (description, make_call, expected_path, expected_options) => {
    await expect(make_call()).resolves.toBe('response');

    const expected_arguments = expected_options ? [expected_path, expected_options] : [expected_path];
    expect(send_authed_request).toHaveBeenCalledWith(...expected_arguments);
  });

  it('upload_resource_file sends the file and title as a form', async () => {
    const file = new File(['pdf'], 'notes.pdf');

    await resource_service.upload_resource_file('s1', file, 'Week 1');

    const [request_path, { method, body }] = send_authed_request.mock.calls[0];
    expect(request_path).toBe('/skills/s1/resources/files');
    expect(method).toBe('POST');
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('title')).toBe('Week 1');
  });

  it('upload_resource_file leaves out an empty title and topic', async () => {
    await resource_service.upload_resource_file('s1', new File(['pdf'], 'notes.pdf'), '');

    expect(send_authed_request.mock.calls[0][1].body.has('title')).toBe(false);
    expect(send_authed_request.mock.calls[0][1].body.has('topic_id')).toBe(false);
  });

  it('upload_resource_file sends the topic to file the upload under', async () => {
    await resource_service.upload_resource_file('s1', new File(['pdf'], 'notes.pdf'), '', 't1');

    expect(send_authed_request.mock.calls[0][1].body.get('topic_id')).toBe('t1');
  });
});
