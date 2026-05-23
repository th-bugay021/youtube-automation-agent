import { Injectable } from '@nestjs/common';
import { Scene } from './script.service';

@Injectable()
export class SubtitlesService {
  /**
   * Builds an SRT subtitle track from the scene list.
   * The Nth subtitle covers the timespan of scene N, using its narration.
   * Long narrations are split into multiple cues so on-screen text remains
   * readable (max ~80 chars per cue).
   */
  build(scenes: Scene[]): string {
    let cursor = 0;
    let cueIndex = 1;
    const out: string[] = [];

    for (const scene of scenes) {
      const cues = this.splitNarration(scene.narration, 80);
      const perCue = scene.durationSeconds / Math.max(1, cues.length);

      for (const text of cues) {
        const start = cursor;
        const end = cursor + perCue;
        out.push(String(cueIndex++));
        out.push(`${this.timestamp(start)} --> ${this.timestamp(end)}`);
        out.push(text);
        out.push('');
        cursor = end;
      }
    }

    return out.join('\n');
  }

  private splitNarration(text: string, maxChars: number): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const cues: string[] = [];
    let buf = '';
    for (const s of sentences) {
      if ((buf + ' ' + s).trim().length > maxChars && buf) {
        cues.push(buf.trim());
        buf = s;
      } else {
        buf = (buf + ' ' + s).trim();
      }
    }
    if (buf) cues.push(buf);
    return cues.length === 0 ? [text] : cues;
  }

  private timestamp(seconds: number): string {
    const ms = Math.floor((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${this.pad(h, 2)}:${this.pad(m, 2)}:${this.pad(s, 2)},${this.pad(ms, 3)}`;
  }

  private pad(n: number, w: number): string {
    return String(n).padStart(w, '0');
  }
}
