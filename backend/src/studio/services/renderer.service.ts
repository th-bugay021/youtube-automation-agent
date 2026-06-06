import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../common/filters/all-exceptions.filter';

export interface RenderSceneInput {
  imageUrl: string;
  durationSeconds: number;
}

export interface RenderInput {
  scenes: RenderSceneInput[];
  voiceoverUrl: string;
  musicUrl?: string | null;
  totalDurationSeconds: number;
}

export interface RenderResult {
  videoUrl: string;
  durationSeconds: number;
}

// Shotstack has two fully separate stacks, each with its own API key:
//   stage → https://api.shotstack.io/edit/stage  (free, watermark-free, for dev)
//   v1    → https://api.shotstack.io/edit/v1      (production)
// SHOTSTACK_ENV selects which; the key must match the environment.
const HOSTS: Record<string, string> = {
  stage: 'https://api.shotstack.io/edit/stage',
  v1: 'https://api.shotstack.io/edit/v1',
};

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = Number(process.env.SHOTSTACK_TIMEOUT_MS) || 10 * 60 * 1000;

// A single HTTP call to Shotstack must complete within this window. Without it,
// a stalled connection (DNS, blocked egress, dropped keep-alive socket) leaves
// fetch pending forever — the render row never advances and only the 15-minute
// watchdog eventually reaps it. Failing fast turns that silent hang into a
// logged, actionable error that flips the creation to FAILED immediately.
const HTTP_TIMEOUT_MS = Number(process.env.SHOTSTACK_HTTP_TIMEOUT_MS) || 30_000;

// Background music sits well under the voiceover.
const MUSIC_VOLUME = 0.08;

/**
 * Renders a slideshow video from per-scene image URLs + a voiceover URL +
 * optional background-music URL using the Shotstack cloud render API.
 *
 * This replaces the previous local-FFmpeg pipeline, which exhausted memory on
 * Render's free tier. All heavy lifting now happens on Shotstack's
 * infrastructure; this service only builds the timeline JSON, submits it, and
 * polls until the hosted MP4 is ready. The caller is responsible for copying
 * the returned URL's bytes into permanent storage if it needs them there.
 */
@Injectable()
export class RendererService {
  private readonly logger = new Logger(RendererService.name);

  private get apiKey(): string {
    const key = process.env.SHOTSTACK_API_KEY?.trim();
    if (!key) {
      throw new DomainError(
        'SHOTSTACK_NOT_CONFIGURED',
        'SHOTSTACK_API_KEY must be set to render videos',
        500,
      );
    }
    return key;
  }

  private get host(): string {
    const env = process.env.SHOTSTACK_ENV?.trim() || 'stage';
    return HOSTS[env] ?? HOSTS.stage;
  }

  async render(input: RenderInput): Promise<RenderResult> {
    const timeline = this.buildTimeline(input);
    const renderId = await this.submit(timeline);
    this.logger.log(`Shotstack render submitted: ${renderId}`);
    const url = await this.poll(renderId);
    this.logger.log(`Shotstack render ${renderId} done`);
    return { videoUrl: url, durationSeconds: input.totalDurationSeconds };
  }

  /** Masks all but the last 4 chars of the API key for safe logging. */
  private maskedKey(): string {
    const k = this.apiKey;
    return k.length <= 4 ? '****' : `${'*'.repeat(k.length - 4)}${k.slice(-4)}`;
  }

  /**
   * fetch wrapper with a hard timeout + full request/response logging. A hung
   * connection is the most likely reason a render never reaches Shotstack, so
   * we abort after HTTP_TIMEOUT_MS and surface the cause instead of hanging.
   */
  private async fetchJson(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<{ status: number; ok: boolean; json: any; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    // Log the exact outgoing request. The API key is masked; everything else
    // (URL, headers, body) is shown verbatim to aid debugging.
    this.logger.log(
      `[Shotstack] -> ${init.method} ${url}\n` +
        `  headers: ${JSON.stringify({ ...init.headers, 'x-api-key': this.maskedKey() })}\n` +
        `  body: ${init.body ?? '(none)'}`,
    );

    const startedAt = Date.now();
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      this.logger.log(
        `[Shotstack] <- ${res.status} ${res.statusText} (${Date.now() - startedAt}ms) ${url}\n` +
          `  body: ${text || '(empty)'}`,
      );

      return { status: res.status, ok: res.ok, json, text };
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      this.logger.error(
        `[Shotstack] FAILED ${init.method} ${url} ${
          aborted ? `timed out after ${HTTP_TIMEOUT_MS}ms` : 'request error'
        } (${Date.now() - startedAt}ms): ${(err as Error)?.message}`,
      );
      throw new DomainError(
        aborted ? 'SHOTSTACK_HTTP_TIMEOUT' : 'SHOTSTACK_HTTP_ERROR',
        aborted
          ? `Shotstack request to ${url} timed out after ${HTTP_TIMEOUT_MS}ms — the API was never reached`
          : `Shotstack request to ${url} failed: ${(err as Error)?.message}`,
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private buildTimeline(input: RenderInput): Record<string, unknown> {
    let cursor = 0;
    const imageClips = input.scenes.map((scene) => {
      const clip = {
        asset: { type: 'image', src: scene.imageUrl },
        start: Number(cursor.toFixed(3)),
        length: Number(scene.durationSeconds.toFixed(3)),
        fit: 'cover',
        effect: 'zoomIn',
      };
      cursor += scene.durationSeconds;
      return clip;
    });

    const tracks: Record<string, unknown>[] = [
      // Tracks render top-first; the images are the only visual track.
      { clips: imageClips },
      {
        clips: [
          {
            asset: { type: 'audio', src: input.voiceoverUrl },
            start: 0,
            length: Number(input.totalDurationSeconds.toFixed(3)),
          },
        ],
      },
    ];

    if (input.musicUrl) {
      tracks.push({
        clips: [
          {
            asset: { type: 'audio', src: input.musicUrl, volume: MUSIC_VOLUME },
            start: 0,
            length: Number(input.totalDurationSeconds.toFixed(3)),
          },
        ],
      });
    }

    return {
      timeline: { background: '#000000', tracks },
      output: { format: 'mp4', resolution: '1080' },
    };
  }

  private async submit(timeline: Record<string, unknown>): Promise<string> {
    const url = `${this.host}/render`;
    this.logger.log(
      `[Shotstack] submitting render to env=${process.env.SHOTSTACK_ENV?.trim() || 'stage'} host=${this.host}`,
    );

    const { ok, status, json } = await this.fetchJson(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(timeline),
    });

    if (!ok || !json?.response?.id) {
      throw new DomainError(
        'SHOTSTACK_SUBMIT',
        `Shotstack submit failed (${status}): ${json?.message ?? 'no render id in response'}`,
        502,
      );
    }
    return json.response.id as string;
  }

  private async poll(renderId: string): Promise<string> {
    const url = `${this.host}/render/${renderId}`;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const { json } = await this.fetchJson(url, {
        method: 'GET',
        headers: { 'x-api-key': this.apiKey },
      });

      const status = json?.response?.status as string | undefined;
      this.logger.log(`[Shotstack] render ${renderId} status=${status ?? 'unknown'}`);

      if (status === 'done') {
        const out = json?.response?.url;
        if (!out) {
          throw new DomainError('SHOTSTACK_NO_URL', 'Render done but no URL returned', 502);
        }
        return out as string;
      }
      if (status === 'failed') {
        throw new DomainError(
          'SHOTSTACK_FAILED',
          `Shotstack render failed: ${json?.response?.error ?? 'unknown'}`,
          502,
        );
      }
      // queued | fetching | rendering | saving → keep polling
    }

    throw new DomainError(
      'SHOTSTACK_TIMEOUT',
      `Shotstack render ${renderId} did not finish within ${POLL_TIMEOUT_MS}ms`,
      504,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
