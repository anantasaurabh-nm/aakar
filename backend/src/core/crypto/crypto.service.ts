import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

/**
 * Server-side-only symmetric encryption for provider credentials. Never used
 * on data that reaches the browser or the AI model (AI Models PRD §9-10).
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const secret = process.env.CREDENTIAL_ENCRYPTION_KEY ?? '';
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(
      '.',
    );
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed encrypted payload');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
