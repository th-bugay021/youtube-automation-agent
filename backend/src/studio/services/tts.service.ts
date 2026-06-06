import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require('@ffmpeg-installer/ffmpeg').path;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobePath: string = require('@ffprobe-installer/ffprobe').path;

// google-tts-api wraps Google Translate's free TTS endpoint — no API key, no
// account. getAllAudioBase64 splits text past the endpoint's ~200-char limit
// into chunks and returns one base64 MP3 per chunk.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const googleTTS: {
  getAllAudioBase64(
    text: string,
    opts: { lang?: string; slow?: boolean; host?: string; splitPunct?: string },
  ): Promise<{ shortText: string; base64: string }[]>;
} = require('google-tts-api');

/**
 * Text-to-speech via gTTS (Google Translate TTS) — free and keyless.
 *
 * The narration is synthesised to MP3, then the caller uploads it to Supabase
 * Storage and hands Shotstack the URL at render time. If gTTS is unreachable
 * (rate-limited / offline) we fall back to a silent MP3 of the expected length
 * so the pipeline still completes and narration shows as on-screen subtitles.
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly lang: string;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  constructor(config: ConfigService) {
    this.lang = config.get<string>('TTS_LANG') ?? 'en';
    // gTTS hits an unofficial Google endpoint that rate-limits datacenter IPs,
    // so retry transient failures with backoff before falling back to silence.
    this.retryAttempts = Number(config.get<string>('TTS_RETRY_ATTEMPTS')) || 3;
    this.retryDelayMs = Number(config.get<string>('TTS_RETRY_DELAY_MS')) || 1500;
  }

  async synthesize(text: string, expectedSeconds: number): Promise<Buffer> {
    const clean = text?.trim();
    if (!clean) return this.silentMp3(expectedSeconds);

    try {
      return await this.gttsWithRetry(clean);
    } catch (err) {
      this.logger.warn(
        { err: (err as Error).message },
        `gTTS failed after ${this.retryAttempts} attempts, using silent audio`,
      );
      return this.silentMp3(expectedSeconds);
    }
  }

  /** Retries gTTS with linear backoff to ride out transient rate limits. */
  private async gttsWithRetry(text: string): Promise<Buffer> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.gtts(text);
      } catch (err) {
        lastErr = err;
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelayMs * attempt;
          this.logger.warn(
            `gTTS attempt ${attempt}/${this.retryAttempts} failed (${(err as Error).message}); retrying in ${delay}ms`,
          );
          await this.sleep(delay);
        }
      }
    }
    throw lastErr;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Synthesize one scene's narration and report the actual audio length so the
   * caller can match the scene's on-screen duration to the spoken length.
   * Falls back to `fallbackSeconds` if the duration can't be probed.
   */
  async synthesizeScene(
    text: string,
    fallbackSeconds: number,
  ): Promise<{ buffer: Buffer; durationSeconds: number }> {
    const buffer = await this.synthesize(text, fallbackSeconds);
    const measured = await this.probeDuration(buffer).catch((err) => {
      this.logger.warn({ err: (err as Error).message }, 'ffprobe failed; using estimated duration');
      return 0;
    });
    return { buffer, durationSeconds: measured > 0 ? measured : fallbackSeconds };
  }

  private async probeDuration(mp3: Buffer): Promise<number> {
    const tmpFile = path.join(os.tmpdir(), `probe-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
    await fs.writeFile(tmpFile, mp3);
    try {
      const out = await this.runFfprobe([
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        tmpFile,
      ]);
      const seconds = parseFloat(out.trim());
      return Number.isFinite(seconds) ? seconds : 0;
    } finally {
      await fs.unlink(tmpFile).catch(() => undefined);
    }
  }

  private runFfprobe(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const p = spawn(ffprobePath, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', (d) => (stdout += d.toString()));
      p.stderr.on('data', (d) => (stderr += d.toString()));
      p.on('error', reject);
      p.on('close', (code) =>
        code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}: ${stderr.slice(-500)}`)),
      );
    });
  }

  private async gtts(text: string): Promise<Buffer> {
    const chunks = await googleTTS.getAllAudioBase64(text, {
      lang: this.lang,
      slow: false,
      host: 'https://translate.google.com',
      splitPunct: ',.?!;:',
    });
    if (!chunks.length) throw new Error('gTTS returned no audio');

    // Each chunk is an independent MP3; concatenating the frame streams yields
    // a single MP3 that Shotstack (and any ffmpeg-based decoder) plays back fine.
    return Buffer.concat(chunks.map((c) => Buffer.from(c.base64, 'base64')));
  }

  private async silentMp3(seconds: number): Promise<Buffer> {
    const tmpFile = path.join(os.tmpdir(), `silent-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
    await this.runFfmpeg([
      '-y',
      '-f', 'lavfi',
      '-i', `anullsrc=r=44100:cl=stereo`,
      '-t', String(seconds),
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      tmpFile,
    ]);
    const buf = await fs.readFile(tmpFile);
    await fs.unlink(tmpFile).catch(() => undefined);
    return buf;
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, args, { windowsHide: true });
      let stderr = '';
      p.stderr.on('data', (d) => (stderr += d.toString()));
      p.on('error', reject);
      p.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`)),
      );
    });
  }
}
