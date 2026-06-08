import { Injectable } from '@nestjs/common';
import { OpenAiService } from '../../ai/openai.service';

/**
 * Royalty-free (CC0 / public-domain) music tracks hosted on Shotstack's public
 * asset bucket. Shotstack fetches these directly over HTTP at render time, so
 * we never need the files on disk or in our own storage.
 */
const TRACKS = [
  {
    id: 'calm-ambient',
    mood: 'calm reflective ambient',
    url: 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/ambisax.mp3',
  },
  {
    id: 'upbeat-corporate',
    mood: 'upbeat energetic corporate',
    url: 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/lit.mp3',
  },
  {
    id: 'cinematic-tense',
    mood: 'cinematic dramatic tense',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: 'tutorial-neutral',
    mood: 'neutral focused tutorial',
    url: 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/palmtrees.mp3',
  },
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
 * Selects a background music track using the LLM, mood-matched to the script,
 * and returns its public URL. Shotstack fetches the audio directly over HTTP at
 * render time, so no files live on disk or in our storage.
 */
@Injectable()
export class MusicService {
  constructor(private readonly openai: OpenAiService) {}

  async pickTrack(fullScript: string): Promise<{ trackId: string; url: string }> {
    const result = await this.openai.chat<{ trackId: string }>({
      system: SYSTEM,
      user: userPrompt(fullScript),
      json: true,
      temperature: 0.3,
      maxTokens: 200,
    });
    const trackId = result.parsed?.trackId ?? TRACKS[0].id;
    const meta = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0];
    return { trackId: meta.id, url: meta.url };
  }
}
