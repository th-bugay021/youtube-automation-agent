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
    const res = await fetch(`${this.host}/render`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(timeline),
    });

    const body = (await res.json().catch(() => null)) as
      | { success?: boolean; message?: string; response?: { id?: string } }
      | null;

    if (!res.ok || !body?.response?.id) {
      throw new DomainError(
        'SHOTSTACK_SUBMIT',
        `Shotstack submit failed (${res.status}): ${body?.message ?? 'unknown error'}`,
        502,
      );
    }
    return body.response.id;
  }

  private async poll(renderId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const res = await fetch(`${this.host}/render/${renderId}`, {
        headers: { 'x-api-key': this.apiKey },
      });
      const body = (await res.json().catch(() => null)) as
        | { response?: { status?: string; url?: string; error?: string } }
        | null;

      const status = body?.response?.status;
      this.logger.debug(`Shotstack render ${renderId}: ${status ?? 'unknown'}`);

      if (status === 'done') {
        const url = body?.response?.url;
        if (!url) {
          throw new DomainError('SHOTSTACK_NO_URL', 'Render done but no URL returned', 502);
        }
        return url;
      }
      if (status === 'failed') {
        throw new DomainError(
          'SHOTSTACK_FAILED',
          `Shotstack render failed: ${body?.response?.error ?? 'unknown'}`,
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
