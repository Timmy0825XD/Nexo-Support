import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

function getEncryptionKey(): Buffer {
  const secret = process.env.CHALLONGE_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new EncryptionError(
      'CHALLONGE_KEY_ENCRYPTION_SECRET is not configured. Set it in the bot environment before storing Challonge API keys.',
    );
  }

  return scryptSync(secret, 'nexo-challonge-key-v1', KEY_LENGTH);
}

export function encryptChallongeKey(plainKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptChallongeKey(cipherText: string): string {
  const key = getEncryptionKey();
  const [ivPart, tagPart, dataPart] = cipherText.split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new EncryptionError('Stored Challonge key is corrupted or invalid.');
  }

  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  const encrypted = Buffer.from(dataPart, 'base64url');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
