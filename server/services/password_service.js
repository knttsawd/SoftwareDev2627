import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PASSWORD_KEY_LENGTH, PASSWORD_SALT_BYTES } from '../config/constants.js';

const scrypt_async = promisify(scrypt);

// Hashes a password with scrypt and a random salt. Returns "<salt hex>:<hash hex>",
// the format stored in users.password_hash.
export async function hash_password(password) {
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const derived_key = await scrypt_async(password, salt, PASSWORD_KEY_LENGTH);
  return `${salt.toString('hex')}:${derived_key.toString('hex')}`;
}

// Checks a password against a stored "<salt>:<hash>". The constant-time comparison stops
// attackers learning how much of a guess was right from how long the check takes.
export async function verify_password(password, stored_hash) {
  const [salt_hex, hash_hex] = stored_hash.split(':');
  const stored_key = Buffer.from(hash_hex, 'hex');
  const derived_key = await scrypt_async(password, Buffer.from(salt_hex, 'hex'), stored_key.length);
  return timingSafeEqual(derived_key, stored_key);
}
