import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import axios from 'axios';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require('@ffmpeg-installer/ffmpeg').path;

/**
 * Text-to-speech with graceful fallback.
 *
 * Primary: ElevenLabs (if ELEVENLABS_API_KEY is set).
 * Fallback: synthesised silent MP3 of the requested duration. Wires the
 * pipeline end-to-end so users can preview videos without a TTS account;
 * narration is shown as on-screen subtitles instead.
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly elevenKey?: string;
  private readonly voiceId: string;

  constructor(config: ConfigService) {
    this.elevenKey = config.get<string>('ELEVENLABS_API_KEY');
    this.voiceId = config.get<string>('ELEVENLABS_VOICE_ID') ?? '21m00Tcm4TlvDq8ikWAM';
  }

  async synthesize(text: string, expectedSeconds: number): Promise<Buffer> {
    if (this.elevenKey) {
      try {
        return await this.elevenLabs(text);
      } catch (err) {
        this.logger.warn({ err: (err as Error).message }, 'ElevenLabs failed, using silent audio');
      }
    }
    return this.silentMp3(expectedSeconds);
  }

  private async elevenLabs(text: string): Promise<Buffer> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`;
    const { data } = await axios.post<ArrayBuffer>(
      url,
      {
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.7 },
      },
      {
        responseType: 'arraybuffer',
        headers: {
          'xi-api-key': this.elevenKey!,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        timeout: 60_000,
      },
    );
    return Buffer.from(data);
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
