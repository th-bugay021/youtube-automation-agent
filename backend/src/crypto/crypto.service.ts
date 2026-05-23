import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

/**
 * AES-256-GCM token encryption.
 * Output format: base64(iv | ciphertext | authTag)
 *  - iv: 12 bytes
 *  - authTag: 16 bytes (appended after ciphertext)
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const hex = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!hex || hex.length !== 64) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars).');
    }
    this.key = Buffer.from(hex, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, enc, tag]).toString('base64');
  }

  decrypt(ciphertextB64: string): string {
    const buf = Buffer.from(ciphertextB64, 'base64');
    if (buf.length < 12 + 16) throw new Error('Invalid ciphertext');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const enc = buf.subarray(12, buf.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }

  /** Deterministic SHA-style hash used for refresh-token lookup (HMAC-like via scrypt). */
  async hashOpaque(token: string): Promise<string> {
    const scryptAsync = promisify(scrypt) as (
      password: string,
      salt: Buffer,
      keylen: number,
    ) => Promise<Buffer>;
    const derived = await scryptAsync(token, this.key, 32);
    return derived.toString('hex');
  }
}
