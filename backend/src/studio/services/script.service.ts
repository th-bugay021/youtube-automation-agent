import { Injectable } from '@nestjs/common';
import { OpenAiService } from '../../ai/openai.service';
import { ChannelStyleProfile } from './intelligence.service';

export interface Scene {
  index: number;
  narration: string;
  durationSeconds: number;
  imageKeyword: string;
  imageUrl?: string;
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
) => `
Topic: ${topic}
Video style: ${videoStyle}
Target length: ${targetSeconds} seconds
Channel style profile:
${JSON.stringify(style, null, 2)}

Generate a script split into scenes. Aim for ~7-12 words per second of narration.
Total scenes should make the video close to ${targetSeconds} seconds when read aloud.

Return JSON:
{
  "scenes": [
    {
      "index": 0,
      "narration": "the spoken text for this scene",
      "durationSeconds": <int, 3-10>,
      "imageKeyword": "2-4 word search term for a stock image that visually fits this scene"
    }
  ]
}`;

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
    }));
  }
}
