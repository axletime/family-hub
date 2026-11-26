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

/** Rules for a new or changed PIN. Returns an error message, or null when it is acceptable. */
export function newPinError(pin: unknown, requireLong: boolean): string | null {
  const min = requireLong ? 6 : 4;
  if (typeof pin !== 'string' || !/^\d+$/.test(pin) || pin.length < min || pin.length > 8) return `PIN must be ${min}–8 digits.`;
  if (/^(\d)\1+$/.test(pin)) return 'Choose a PIN that isn’t the same digit repeated.';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Choose a PIN that isn’t a simple sequence.';
  return null;
}
