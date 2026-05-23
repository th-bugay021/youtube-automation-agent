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

/**
 * Searches Pixabay for stock images by keyword. Free, ~100 RPS limit.
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

  private async downloadAsBuffer(url: string): Promise<Buffer> {
    const { data } = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 30_000,
    });
    return Buffer.from(data);
  }

  /** Last word of the keyword often works when the full phrase is too specific. */
  private fallbackTerm(keyword: string): string {
    const parts = keyword.split(/\s+/).filter(Boolean);
    return parts[parts.length - 1] ?? keyword;
  }
}
