import { describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE } from '../../config/constants.js';
import { open_database } from '../../db/database.js';
import { extract_pdf_text } from '../../services/extraction/pdf_extractor.js';
import { build_test_pdf } from './build_test_pdf.js';
import { create_spied_ai, create_student_with_skill, insert_test_resource } from './study_fixtures.js';

describe('build_test_pdf', () => {
  it('builds a PDF that pdf-parse can read', async () => {
    const pdf_text = await extract_pdf_text(build_test_pdf('Mitochondria make energy'));

    expect(pdf_text).toContain('Mitochondria make energy');
  });
});

describe('create_student_with_skill and insert_test_resource', () => {
  it('creates a student, a skill and a ready resource', async () => {
    const database = open_database(IN_MEMORY_DATABASE);

    const { user_id, skill } = await create_student_with_skill(database);
    insert_test_resource(database, { user_id, skill_id: skill.id });

    expect(skill.name).toBe('Biology');
    expect(database.prepare('SELECT count(*) AS resource_count FROM resources').get().resource_count).toBe(1);
  });
});

describe('create_spied_ai', () => {
  it('returns the mock AI with spied methods', async () => {
    const { ai_provider, transcriber } = create_spied_ai();

    await transcriber.transcribe(Buffer.from(''), 'talk.mp3');

    expect(ai_provider.name).toBe('mock');
    expect(transcriber.transcribe).toHaveBeenCalledWith(expect.any(Buffer), 'talk.mp3');
  });
});
