import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenAiService } from '../../ai/openai.service';

export interface ChannelStyleProfile {
  tone: string;
  format: string;
  voicePattern: string;
  niche: string;
  topThemes: string[];
  averageVideoLength: string;
  hookStyle: string;
}

const SYSTEM = `You are analysing a YouTube channel to learn its style.
Return JSON only.`;

const userPrompt = (titles: string[], niche?: string) => `
Channel niche hint: ${niche ?? 'unknown'}
Recent video titles:
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Return JSON:
{
  "tone": "one short phrase (e.g. 'casual, energetic')",
  "format": "tutorial|listicle|story|reaction|analysis|news|mixed",
  "voicePattern": "one sentence describing how this creator talks",
  "niche": "concise niche label",
  "topThemes": ["3-5 recurring themes"],
  "averageVideoLength": "short|medium|long",
  "hookStyle": "one phrase describing how their titles hook viewers"
}`;

/**
 * Inspects a channel's recent videos to derive a style profile that
 * future generations (scripts, image keywords, voice) follow.
 *
 * Pulls the channel's last 20 published video titles from our DB. If the
 * channel hasn't published anything yet, returns a neutral default profile
 * so the wizard can still proceed.
 */
@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
  ) {}

  async analyze(channelId: string): Promise<ChannelStyleProfile> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return this.defaultProfile('unknown');
    }

    const videos = await this.prisma.video.findMany({
      where: { channelId, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 20,
      select: { title: true },
    });

    if (videos.length === 0) {
      return this.defaultProfile(channel.niche ?? 'general');
    }

    const result = await this.openai.chat<ChannelStyleProfile>({
      system: SYSTEM,
      user: userPrompt(videos.map((v) => v.title), channel.niche ?? undefined),
      json: true,
      temperature: 0.4,
    });

    return result.parsed ?? this.defaultProfile(channel.niche ?? 'general');
  }

  private defaultProfile(niche: string): ChannelStyleProfile {
    return {
      tone: 'clear, friendly',
      format: 'tutorial',
      voicePattern: 'speaks directly to one viewer at a time',
      niche,
      topThemes: [niche],
      averageVideoLength: 'medium',
      hookStyle: 'curiosity-driven opening question',
    };
  }
}
