import { Injectable } from '@nestjs/common';
import { OpenAiService } from '../../ai/openai.service';
import { ChannelStyleProfile } from './intelligence.service';

export interface Scene {
  index: number;
  narration: string;
  durationSeconds: number;
  imageKeyword: string;
  imageUrl?: string;
  videoUrl?: string;
  /** Per-scene motion effect (see RendererService); defaults to 'ken-burns'. */
  motionEffect?: string;
  /** Supabase path of a user-uploaded image that overrides the stock asset. */
  customImagePath?: string;
}

interface ScriptResponse {
  scenes: Scene[];
}

const SYSTEM = `You write production-ready YouTube video scripts as JSON.
Each scene's narration is what a voiceover would read aloud — no stage directions,
no markdown, no asterisks. Keep sentences short.`;

const userPrompt = (
  topic: string,
  style: ChannelStyleProfile,
  videoStyle: string,
  targetSeconds: number,
) => {
  const themes = (style.topThemes ?? []).filter((t) => t && t !== style.niche);
  return `
Topic: ${topic}
Niche: ${style.niche}
Video style: ${videoStyle}
Target length: ${targetSeconds} seconds

The NICHE above is authoritative: every scene's subject matter and image keyword
must stay within "${style.niche}" and serve the topic. Do NOT drift to unrelated
subjects.

Channel voice (apply to HOW the narration sounds, not WHAT it is about):
- tone: ${style.tone}
- format: ${style.format}
- voicePattern: ${style.voicePattern}
- hookStyle: ${style.hookStyle}
- averageVideoLength: ${style.averageVideoLength}
${themes.length ? `Secondary recurring themes (use only where they fit the niche and topic; ignore any that conflict): ${themes.join(', ')}` : ''}

Generate a script split into scenes. Aim for ~7-12 words per second of narration.
Total scenes should make the video close to ${targetSeconds} seconds when read aloud.

Return JSON:
{
  "scenes": [
    {
      "index": 0,
      "narration": "the spoken text for this scene",
      "durationSeconds": <int, 3-10>,
      "imageKeyword": "2-4 word search term for a stock image that fits this scene and the niche \"${style.niche}\""
    }
  ]
}`;
};

@Injectable()
export class ScriptService {
  constructor(private readonly openai: OpenAiService) {}

  async generate(
    topic: string,
    style: ChannelStyleProfile,
    videoStyle: string,
    targetSeconds: number,
  ): Promise<Scene[]> {
    const result = await this.openai.chat<ScriptResponse>({
      system: SYSTEM,
      user: userPrompt(topic, style, videoStyle, targetSeconds),
      json: true,
      temperature: 0.8,
      maxTokens: 2500,
    });
    const scenes = result.parsed?.scenes ?? [];
    return scenes.map((s, i) => ({
      ...s,
      index: i,
      durationSeconds: Math.max(2, Math.min(15, s.durationSeconds || 5)),
      // Every scene defaults to the cinematic Ken Burns motion; the user can
      // override this per scene in the scene editor before rendering.
      motionEffect: s.motionEffect ?? 'ken-burns',
    }));
  }
}
