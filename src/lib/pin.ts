import 'server-only';
import crypto from 'node:crypto';

const KEYLEN = 32;
const PARAMS = { N: 16384, r: 8, p: 1 };

/** Hash a PIN with scrypt and a random salt. Format: scrypt$salt$hash (hex). */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, KEYLEN, PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length, PARAMS);
  return crypto.timingSafeEqual(expected, actual);
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}
