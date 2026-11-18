import crypto from 'node:crypto';

const KEY_LENGTH = 64;

/** Returns "salt:hash" (scrypt). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex')}`;
}

/** Constant-time check of a password against a stored "salt:hash". */
export function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== KEY_LENGTH) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(password, salt, KEY_LENGTH), expected);
}

/** Random hex string, e.g. for session tokens and file ids. */
export const randomHex = bytes => crypto.randomBytes(bytes).toString('hex');
