import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DomainError } from '../../common/filters/all-exceptions.filter';

interface PixabayHit {
  id: number;
  largeImageURL: string;
  webformatURL: string;
  imageWidth: number;
  imageHeight: number;
  tags: string;
}

interface PixabayResponse {
  total: number;
  hits: PixabayHit[];
}

interface PixabayVideoFile {
  url: string;
  width: number;
  height: number;
  size: number;
}

interface PixabayVideoHit {
  id: number;
  duration: number;
  tags: string;
  videos: {
    large?: PixabayVideoFile;
    medium?: PixabayVideoFile;
    small?: PixabayVideoFile;
    tiny?: PixabayVideoFile;
  };
}

interface PixabayVideoResponse {
  total: number;
  hits: PixabayVideoHit[];
}

// Faceless scenes download a stock video per scene into memory before uploading
// to storage. On a 512MB instance the `large` rendition (tens of MB, transiently
// doubled by Buffer.from) can OOM-kill the process mid-job — the job then hangs
// at GENERATING_IMAGES instead of failing. We therefore pick the highest-res
// rendition whose file size is under this budget; if none qualifies the caller
// falls back to a still image. The download is hard-capped as a backstop against
// a rendition that under-reports its size. A 720p clip upscaled by Shotstack is
// fine for b-roll.
const MAX_CLIP_BYTES = Number(process.env.PIXABAY_MAX_CLIP_BYTES) || 20 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = Number(process.env.PIXABAY_MAX_DOWNLOAD_BYTES) || 20 * 1024 * 1024;

/**
 * Searches Pixabay for stock images and videos by keyword. Free, ~100 RPS limit.
 * Falls back to a generic search term if the specific keyword returns nothing.
 */
@Injectable()
export class PixabayService {
  private readonly logger = new Logger(PixabayService.name);
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('PIXABAY_KEY');
  }

  async searchAndDownload(keyword: string): Promise<Buffer> {
    if (!this.apiKey) {
      throw new DomainError('PIXABAY_NOT_CONFIGURED', 'PIXABAY_KEY env var is required', 500);
    }

    const candidates = [keyword, this.fallbackTerm(keyword), 'abstract background'];
    for (const term of candidates) {
      const url = await this.searchFirst(term);
      if (url) return this.downloadAsBuffer(url);
    }
    throw new DomainError('PIXABAY_NO_RESULTS', `No images found for "${keyword}"`, 502);
  }

  /**
   * Finds a stock video clip for the keyword and returns its bytes. Prefers a
   * clip at least `minDurationSeconds` long so it fills the scene's timeline
   * slot without freezing on the last frame. Falls back through a looser term
   * and finally a generic cinematic search.
   *
   * Returns null when no candidate has a rendition under the size budget, so the
   * caller can fall back to a still image for the scene.
   */
  async searchAndDownloadVideo(keyword: string, minDurationSeconds = 0): Promise<Buffer | null> {
    if (!this.apiKey) {
      throw new DomainError('PIXABAY_NOT_CONFIGURED', 'PIXABAY_KEY env var is required', 500);
    }

    const candidates = [keyword, this.fallbackTerm(keyword), 'cinematic background'];
    for (const term of candidates) {
      const url = await this.searchFirstVideo(term, minDurationSeconds);
      if (url) return this.downloadAsBuffer(url);
    }
    return null;
  }

  private async searchFirst(query: string): Promise<string | null> {
    try {
      const { data } = await axios.get<PixabayResponse>('https://pixabay.com/api/', {
        params: {
          key: this.apiKey,
          q: query,
          image_type: 'photo',
          orientation: 'horizontal',
          safesearch: 'true',
          per_page: 5,
          min_width: 1280,
        },
        timeout: 15_000,
      });
      const hit = data.hits[0];
      return hit?.largeImageURL ?? null;
    } catch (err) {
      this.logger.warn({ err, query }, 'Pixabay search failed');
      return null;
    }
  }

  private async searchFirstVideo(query: string, minDuration: number): Promise<string | null> {
    try {
      const { data } = await axios.get<PixabayVideoResponse>('https://pixabay.com/api/videos/', {
        params: {
          key: this.apiKey,
          q: query,
          safesearch: 'true',
          per_page: 10,
        },
        timeout: 15_000,
      });
      const hits = data.hits ?? [];
      if (hits.length === 0) return null;
      // Prefer a clip long enough to cover the scene; otherwise take the longest
      // available so the freeze-on-last-frame gap is as small as possible.
      const ordered = [...hits].sort((a, b) => {
        const aOk = a.duration >= minDuration ? 0 : 1;
        const bOk = b.duration >= minDuration ? 0 : 1;
        if (aOk !== bOk) return aOk - bOk;
        return b.duration - a.duration;
      });
      return this.pickRendition(ordered[0]);
    } catch (err) {
      this.logger.warn({ err, query }, 'Pixabay video search failed');
      return null;
    }
  }

  /**
   * Picks a memory-safe rendition: the highest-resolution file whose reported
   * size is within MAX_CLIP_BYTES. Returns null when no rendition has a known
   * size under budget — the caller then falls back to a still image rather than
   * risking an OOM or a download that trips the content-length cap.
   */
  private pickRendition(hit: PixabayVideoHit): string | null {
    const files = [hit.videos.large, hit.videos.medium, hit.videos.small, hit.videos.tiny].filter(
      (f): f is PixabayVideoFile => !!f?.url,
    );
    const area = (f: PixabayVideoFile) => (f.width || 0) * (f.height || 0);
    const underBudget = files.filter((f) => f.size > 0 && f.size <= MAX_CLIP_BYTES);
    if (underBudget.length === 0) return null;
    // Best quality that still fits the budget.
    underBudget.sort((a, b) => area(b) - area(a));
    return underBudget[0].url;
  }

  private async downloadAsBuffer(url: string): Promise<Buffer> {
    const { data } = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      // Backstop against a rendition that lies about its size: abort rather than
      // buffer an unbounded body into memory.
      maxContentLength: MAX_DOWNLOAD_BYTES,
      maxBodyLength: MAX_DOWNLOAD_BYTES,
    });
    return Buffer.from(data);
  }

  /** Last word of the keyword often works when the full phrase is too specific. */
  private fallbackTerm(keyword: string): string {
    const parts = keyword.split(/\s+/).filter(Boolean);
    return parts[parts.length - 1] ?? keyword;
  }
}
