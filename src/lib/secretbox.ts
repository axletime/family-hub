import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * AES-256-GCM encryption for secrets stored in SQLite (API keys, tokens).
 *
 * The key comes from the APP_SECRET environment variable when set (hashed to
 * 32 bytes), otherwise from a random key file kept next to the database
 * (`<DATA_DIR>/.secret-key`, mode 600) that is created on first use.
 */

const PREFIX = 'v1:';
const g = globalThis as unknown as { __fhSecretKey?: { id: string; key: Buffer } };

export function dataDir(): string {
  return (process.env.DATA_DIR || '').trim() || '/data';
}

function loadKey(): Buffer {
  const appSecret = (process.env.APP_SECRET || '').trim();
  const id = appSecret ? `env:${crypto.createHash('sha256').update(appSecret).digest('hex')}` : `file:${dataDir()}`;
  if (g.__fhSecretKey?.id === id) return g.__fhSecretKey.key;

  let key: Buffer;
  if (appSecret) {
    key = crypto.createHash('sha256').update(appSecret, 'utf8').digest();
  } else {
    const file = path.join(dataDir(), '.secret-key');
    if (fs.existsSync(file)) {
      key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
      if (key.length !== 32) throw new Error(`${file} is not a valid key (expected 32 bytes, base64).`);
    } else {
      fs.mkdirSync(dataDir(), { recursive: true });
      key = crypto.randomBytes(32);
      fs.writeFileSync(file, key.toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
      console.log(`[family-hub] Created encryption key file ${file} for saved API keys. Keep it with your backups.`);
    }
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* best effort (e.g. read-only or foreign-owned file) */
    }
  }
  g.__fhSecretKey = { id, key };
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

/** Returns null when the value cannot be decrypted (e.g. APP_SECRET changed). */
export function decryptSecret(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return null;
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
