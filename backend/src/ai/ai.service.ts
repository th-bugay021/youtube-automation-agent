import { Injectable } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  IDEA_SYSTEM,
  METADATA_SYSTEM,
  TREND_SYSTEM,
  ideaUserPrompt,
  metadataUserPrompt,
  trendUserPrompt,
} from './prompts/content.prompts';

export interface VideoIdea {
  title: string;
  angle: string;
  primaryKeyword: string;
  estimatedSearchVolume: 'low' | 'medium' | 'high';
  format: string;
  thumbnailConcept: string;
}

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  categoryId: string;
  thumbnailPrompt: string;
}

export interface TrendItem {
  topic: string;
  why: string;
  urgency: 'low' | 'medium' | 'high';
}

@Injectable()
export class AiService {
  constructor(
    private readonly openai: OpenAiService,
    private readonly prisma: PrismaService,
  ) {}

  async generateIdeas(channelId: string, count = 5): Promise<VideoIdea[]> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return [];

    const recent = await this.prisma.video.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { title: true },
    });

    const result = await this.openai.chat<{ ideas: VideoIdea[] }>({
      system: IDEA_SYSTEM,
      user: ideaUserPrompt(channel.niche ?? 'general', count, recent.map((r) => r.title)),
      json: true,
    });

    await this.recordJob(channelId, 'idea', result);
    return result.parsed?.ideas ?? [];
  }

  async generateMetadata(channelId: string, topic: string): Promise<VideoMetadata | null> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return null;

    const result = await this.openai.chat<VideoMetadata>({
      system: METADATA_SYSTEM,
      user: metadataUserPrompt(topic, channel.niche ?? 'general'),
      json: true,
    });

    await this.recordJob(channelId, 'bundle', result);
    return result.parsed ?? null;
  }

  async generateTrends(channelId: string): Promise<TrendItem[]> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return [];

    const result = await this.openai.chat<{ trends: TrendItem[] }>({
      system: TREND_SYSTEM,
      user: trendUserPrompt(channel.niche ?? 'general'),
      json: true,
    });

    await this.recordJob(channelId, 'trend', result);
    return result.parsed?.trends ?? [];
  }

  private async recordJob(
    channelId: string,
    kind: string,
    result: { content: string; tokensIn: number; tokensOut: number; parsed?: unknown },
  ): Promise<void> {
    await this.prisma.aiJob.create({
      data: {
        channelId,
        kind,
        prompt: '<encoded above>',
        result: (result.parsed as any) ?? { raw: result.content },
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        status: 'done',
        completedAt: new Date(),
      },
    });
  }
}
