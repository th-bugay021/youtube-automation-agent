import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '../../common/filters/all-exceptions.filter';

/**
 * Thin wrapper over Supabase Storage.
 *
 * Uses the service-role key so workers can write to any path regardless of RLS.
 * Returns signed URLs for client playback; raw `path` is what we persist in DB.
 *
 * The client is created lazily on first use so the rest of the app boots even
 * when Supabase Storage isn't configured yet — studio routes will surface a
 * clear 500 with code STORAGE_NOT_CONFIGURED in that case.
 */
@Injectable()
export class StorageService {
  private client?: SupabaseClient;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'studio';
  }

  private c(): SupabaseClient {
    if (this.client) return this.client;
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      throw new DomainError(
        'STORAGE_NOT_CONFIGURED',
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use the studio',
        500,
      );
    }
    this.client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return this.client;
  }

  /** Lazy bucket create. Idempotent. */
  async ensureBucket(): Promise<void> {
    const { data, error } = await this.c().storage.getBucket(this.bucket);
    if (data) return;
    if (error && !/not found/i.test(error.message)) throw error;
    await this.c().storage.createBucket(this.bucket, { public: false });
  }

  async upload(path: string, body: Buffer, contentType: string): Promise<string> {
    const { error } = await this.c().storage
      .from(this.bucket)
      .upload(path, body, { contentType, upsert: true });
    if (error) throw new DomainError('STORAGE_UPLOAD', error.message, 502);
    return path;
  }

  /** Returns a 1-hour signed URL for client playback. */
  async signedUrl(path: string, expiresInSec = 3600): Promise<string> {
    const { data, error } = await this.c().storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSec);
    if (error || !data) throw new DomainError('STORAGE_SIGN', error?.message ?? 'sign failed', 502);
    return data.signedUrl;
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.c().storage.from(this.bucket).download(path);
    if (error || !data) throw new DomainError('STORAGE_DOWNLOAD', error?.message ?? 'download', 502);
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.c().storage.from(this.bucket).remove(paths);
  }
}
