import { Injectable } from '@nestjs/common';
import { OpenAiService } from '../../ai/openai.service';
import { ChannelStyleProfile } from './intelligence.service';

export interface Scene {
  index: number;
  narration: string;
  durationSeconds: number;
  /** Short stock-search term — used by faceless videos to find a clip. */
  imageKeyword: string;
  /**
   * Detailed image-generation prompt derived from the narration + niche. Drives
   * OpenAI image generation for still-image (non-faceless) styles. Cinematic,
   * photorealistic, no text/logos.
   */
  imagePrompt?: string;
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

/**
 * Builds a detailed, narration-driven image-generation prompt for a scene.
 * Used as a fallback when the model didn't return an `imagePrompt` (e.g. older
 * creations) and by the scene-editor refresh path. Mirrors the rules baked into
 * the script prompt: identify the core visual, add cinematic descriptors, keep
 * it on-niche, forbid text/logos, and end with the fixed quality suffix.
 */
export function buildImagePrompt(narration: string, niche?: string): string {
  const base = narration.trim().replace(/\s+/g, ' ').slice(0, 400);
  const nicheCtx = niche
    ? ` The subject and visual style should clearly fit the "${niche}" niche.`
    : '';
  return (
    `A single photorealistic scene that visually represents: ${base}.${nicheCtx} ` +
    `Real-world subject and setting, natural depth of field, dramatic cinematic lighting, ` +
    `professional composition like a high-end stock photo or YouTube thumbnail. ` +
    `Absolutely no text, words, letters, captions, logos, or watermarks. ` +
    `photorealistic, cinematic, high quality`
  );
}

const SYSTEM = `You write production-ready YouTube video scripts as JSON.
Each scene's narration is what a voiceover would read aloud — no stage directions,
no markdown, no asterisks. Keep sentences short.
You also write an "imagePrompt" for each scene: a vivid, concrete prompt for an
AI image generator that depicts the scene's core visual concept.`;

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

The NICHE above is authoritative: every scene's subject matter, image keyword, and
image prompt must stay within "${style.niche}" and serve the topic. Do NOT drift to
unrelated subjects (for example, if the niche is "ai-tools" the visuals must feel
tech/AI-related, never generic or anime-styled).

Channel voice (apply to HOW the narration sounds, not WHAT it is about):
- tone: ${style.tone}
- format: ${style.format}
- voicePattern: ${style.voicePattern}
- hookStyle: ${style.hookStyle}
- averageVideoLength: ${style.averageVideoLength}
${themes.length ? `Secondary recurring themes (use only where they fit the niche and topic; ignore any that conflict): ${themes.join(', ')}` : ''}

For each scene also write an "imagePrompt" for an AI image generator. Rules:
- Base it on the FULL narration of that scene; identify its core visual concept and
  describe a concrete real-world scene (who/what, setting, action).
- Add cinematic descriptors: lighting, mood, camera/composition, style.
- Keep it clearly within the "${style.niche}" niche so the visuals feel on-topic.
- Under 150 words. Plain prose, no JSON, no lists.
- Never depict any text, words, letters, captions, logos, or watermarks.
- It should feel like a professional YouTube thumbnail or premium stock photo.
- Always end with exactly: photorealistic, cinematic, high quality

Generate a script split into scenes. Aim for ~7-12 words per second of narration.
Total scenes should make the video close to ${targetSeconds} seconds when read aloud.

Return JSON:
{
  "scenes": [
    {
      "index": 0,
      "narration": "the spoken text for this scene",
      "durationSeconds": <int, 3-10>,
      "imageKeyword": "2-4 word stock-search term that fits this scene and the niche \"${style.niche}\"",
      "imagePrompt": "detailed <150-word cinematic, photorealistic image prompt with no text or logos, ending with: photorealistic, cinematic, high quality"
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
      // Higher ceiling: each scene now also carries a ~100-word imagePrompt.
      maxTokens: 4000,
    });
    const scenes = result.parsed?.scenes ?? [];
    return scenes.map((s, i) => ({
      ...s,
      index: i,
      durationSeconds: Math.max(2, Math.min(15, s.durationSeconds || 5)),
      // Fall back to a narration-derived prompt if the model omitted one, so
      // non-faceless image generation always has something detailed to work with.
      imagePrompt: s.imagePrompt?.trim() || buildImagePrompt(s.narration, style.niche),
      // Every scene defaults to the cinematic Ken Burns motion; the user can
      // override this per scene in the scene editor before rendering.
      motionEffect: s.motionEffect ?? 'ken-burns',
    }));
  }
}
