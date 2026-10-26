import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  get_user_folder,
  remove_stored_file,
  remove_user_files,
  save_user_file,
} from '../services/storage_service.js';

let uploads_path;

beforeEach(() => {
  uploads_path = mkdtempSync(path.join(tmpdir(), 'studyapp-uploads-'));
});

afterEach(() => {
  rmSync(uploads_path, { recursive: true, force: true });
});

describe('get_user_folder', () => {
  it('puts each student in their own folder', () => {
    expect(get_user_folder(uploads_path, 'user-1')).toBe(path.join(uploads_path, 'user-1'));
  });
});

describe('save_user_file and remove_stored_file', () => {
  it('saves a file under the student folder, returns its relative path, and removes it', async () => {
    const relative_path = await save_user_file(uploads_path, 'user-1', 'resource-1.pdf', Buffer.from('pdf bytes'));

    expect(relative_path).toBe('user-1/resource-1.pdf');
    expect(readFileSync(path.join(uploads_path, relative_path), 'utf8')).toBe('pdf bytes');

    await remove_stored_file(uploads_path, relative_path);
    expect(existsSync(path.join(uploads_path, relative_path))).toBe(false);
  });

  it('succeeds when removing a file that is already gone', async () => {
    await expect(remove_stored_file(uploads_path, 'user-1/missing.pdf')).resolves.toBeUndefined();
  });
});

describe('remove_user_files', () => {
  it("deletes the student's folder and leaves other students alone", async () => {
    for (const user_id of ['user-1', 'user-2']) {
      mkdirSync(get_user_folder(uploads_path, user_id));
      writeFileSync(path.join(get_user_folder(uploads_path, user_id), 'notes.pdf'), 'pdf');
    }

    await remove_user_files(uploads_path, 'user-1');

    expect(existsSync(get_user_folder(uploads_path, 'user-1'))).toBe(false);
    expect(existsSync(get_user_folder(uploads_path, 'user-2'))).toBe(true);
  });

  it('succeeds when the student never uploaded anything', async () => {
    await expect(remove_user_files(uploads_path, 'user-without-files')).resolves.toBeUndefined();
  });
});
