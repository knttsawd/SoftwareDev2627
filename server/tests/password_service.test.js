import { describe, expect, it } from 'vitest';
import { hash_password, verify_password } from '../services/password_service.js';

describe('hash_password', () => {
  it('returns "salt:hash" and never the password itself', async () => {
    const stored_hash = await hash_password('correct horse');

    expect(stored_hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(stored_hash).not.toContain('correct horse');
  });

  it('uses a new salt each time, so equal passwords get different hashes', async () => {
    expect(await hash_password('same password')).not.toBe(await hash_password('same password'));
  });
});

describe('verify_password', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored_hash = await hash_password('correct horse');

    await expect(verify_password('correct horse', stored_hash)).resolves.toBe(true);
    await expect(verify_password('wrong horse', stored_hash)).resolves.toBe(false);
  });
});
