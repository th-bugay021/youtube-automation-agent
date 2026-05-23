import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require('@ffmpeg-installer/ffmpeg').path;

export interface RenderSceneInput {
  imageBuffer: Buffer;
  durationSeconds: number;
}

export interface RenderInput {
  scenes: RenderSceneInput[];
  voiceoverBuffer: Buffer;
  musicBuffer: Buffer | null;
  subtitleSrt: string;
}

export interface RenderResult {
  videoBuffer: Buffer;
  thumbnailBuffer: Buffer;
  durationSeconds: number;
}

const RESOLUTION = { w: 1920, h: 1080 };
const FPS = 30;

/**
 * Renders a slideshow video from per-scene images + voiceover + optional
 * music + burned-in subtitles using FFmpeg.
 *
 * Pipeline (single ffmpeg invocation):
 *   1. For each scene, load image as a fixed-duration video segment with Ken Burns zoom.
 *   2. Concatenate the segments.
 *   3. Mix voiceover with background music (music at -22 dB so it sits under speech).
 *   4. Burn the SRT subtitles into the video stream.
 *   5. Encode H.264 + AAC, MP4 container.
 */
@Injectable()
export class RendererService {
  private readonly logger = new Logger(RendererService.name);

  async render(input: RenderInput): Promise<RenderResult> {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-render-'));
    try {
      const imagePaths: string[] = [];
      for (let i = 0; i < input.scenes.length; i++) {
        const p = path.join(workDir, `scene-${i.toString().padStart(3, '0')}.jpg`);
        await fs.writeFile(p, input.scenes[i].imageBuffer);
        imagePaths.push(p);
      }

      const voicePath = path.join(workDir, 'voice.mp3');
      await fs.writeFile(voicePath, input.voiceoverBuffer);

      let musicPath: string | null = null;
      if (input.musicBuffer) {
        musicPath = path.join(workDir, 'music.mp3');
        await fs.writeFile(musicPath, input.musicBuffer);
      }

      const srtPath = path.join(workDir, 'subs.srt');
      await fs.writeFile(srtPath, input.subtitleSrt, 'utf8');

      const concatFile = path.join(workDir, 'concat.txt');
      const concatLines: string[] = [];
      for (let i = 0; i < imagePaths.length; i++) {
        concatLines.push(`file '${imagePaths[i].replace(/'/g, "'\\''")}'`);
        concatLines.push(`duration ${input.scenes[i].durationSeconds.toFixed(3)}`);
      }
      // ffmpeg concat demuxer requires the last image listed again without a duration.
      concatLines.push(`file '${imagePaths[imagePaths.length - 1].replace(/'/g, "'\\''")}'`);
      await fs.writeFile(concatFile, concatLines.join('\n'));

      const totalDuration = input.scenes.reduce((a, s) => a + s.durationSeconds, 0);
      const outputPath = path.join(workDir, 'out.mp4');
      const subEscaped = this.escapeFilterPath(srtPath);
      const videoFilter = `scale=${RESOLUTION.w}:${RESOLUTION.h}:force_original_aspect_ratio=increase,crop=${RESOLUTION.w}:${RESOLUTION.h},fps=${FPS},subtitles='${subEscaped}'`;

      const args: string[] = [
        '-y',
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-i', voicePath,
      ];
      if (musicPath) args.push('-i', musicPath);

      args.push('-filter_complex');
      if (musicPath) {
        args.push(
          `[0:v]${videoFilter}[v];` +
          `[2:a]volume=0.08[bg];` +
          `[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]`,
        );
        args.push('-map', '[v]', '-map', '[a]');
      } else {
        args.push(`[0:v]${videoFilter}[v]`);
        args.push('-map', '[v]', '-map', '1:a');
      }

      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-t', totalDuration.toFixed(3),
        outputPath,
      );

      await this.runFfmpeg(args);

      const videoBuffer = await fs.readFile(outputPath);

      // Use the first scene's image as the thumbnail (already 16:9-cropped).
      const thumbPath = path.join(workDir, 'thumb.jpg');
      await this.runFfmpeg([
        '-y', '-i', outputPath, '-vf', `thumbnail,scale=${RESOLUTION.w}:${RESOLUTION.h}`,
        '-frames:v', '1', thumbPath,
      ]);
      const thumbnailBuffer = await fs.readFile(thumbPath);

      return { videoBuffer, thumbnailBuffer, durationSeconds: totalDuration };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.debug({ args }, 'ffmpeg');
      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('error', reject);
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-1500)}`)),
      );
    });
  }

  /**
   * FFmpeg's subtitles filter requires forward slashes and escaped colons on Windows.
   * Example: `C:\Users\foo\subs.srt` → `C\\:/Users/foo/subs.srt`
   */
  private escapeFilterPath(p: string): string {
    return p.replace(/\\/g, '/').replace(/:/g, '\\:');
  }
}
