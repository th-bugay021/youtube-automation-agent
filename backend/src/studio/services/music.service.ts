import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { OpenAiService } from '../../ai/openai.service';

/** Bundled CC0 music tracks shipped with the repo. */
const TRACKS = [
  { id: 'calm-ambient', mood: 'calm reflective ambient', path: 'calm-ambient.mp3' },
  { id: 'upbeat-corporate', mood: 'upbeat energetic corporate', path: 'upbeat-corporate.mp3' },
  { id: 'cinematic-tense', mood: 'cinematic dramatic tense', path: 'cinematic-tense.mp3' },
  { id: 'tutorial-neutral', mood: 'neutral focused tutorial', path: 'tutorial-neutral.mp3' },
];

const SYSTEM = 'You pick the best mood-matched music track. JSON only.';

const userPrompt = (script: string) => `
You have these music tracks:
${TRACKS.map((t) => `- ${t.id}: ${t.mood}`).join('\n')}

Pick one that best matches this video script's vibe:
"""
${script.slice(0, 2000)}
"""

Return JSON: { "trackId": "<one of the ids above>" }`;

/**
 * Selects a background music track using the LLM, mood-matched to the script.
 * The actual audio files are bundled in `backend/storage/assets/music/`.
 * If the file is missing on disk we degrade silently — the renderer treats
 * missing music as "no background audio".
 */
@Injectable()
export class MusicService {
  private readonly bundledDir = path.resolve(__dirname, '../../../storage/assets/music');

  constructor(private readonly openai: OpenAiService) {}

  async pickTrack(fullScript: string): Promise<{ trackId: string; buffer: Buffer | null }> {
    const result = await this.openai.chat<{ trackId: string }>({
      system: SYSTEM,
      user: userPrompt(fullScript),
      json: true,
      temperature: 0.3,
      maxTokens: 200,
    });
    const trackId = result.parsed?.trackId ?? TRACKS[0].id;
    const meta = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0];
    const fp = path.join(this.bundledDir, meta.path);
    try {
      const buf = await fs.readFile(fp);
      return { trackId: meta.id, buffer: buf };
    } catch {
      return { trackId: meta.id, buffer: null };
    }
  }
}
