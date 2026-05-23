import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const NICHE_FALLBACK: Record<string, { dayOfWeek: number; hour: number }> = {
  default: { dayOfWeek: 2, hour: 14 }, // Tuesday 14:00 viewer-local
  gaming: { dayOfWeek: 5, hour: 18 },
  finance: { dayOfWeek: 1, hour: 9 },
  fitness: { dayOfWeek: 0, hour: 7 },
  tech: { dayOfWeek: 3, hour: 16 },
};

export interface BestTimeSuggestion {
  dayOfWeek: number;
  hour: number;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
  publishAt: Date;
}

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Buckets the last 90 days of analytics by (dayOfWeek, hour), weighted by
   * views * averageViewPct, and returns the top-scoring slot. Falls back to a
   * niche-based heuristic when the channel has insufficient data.
   */
  async suggestBestTime(channelId: string): Promise<BestTimeSuggestion> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error('Channel not found');

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.analyticsSnapshot.findMany({
      where: { channelId, capturedAt: { gte: since } },
    });

    const publishedCount = await this.prisma.video.count({
      where: { channelId, status: 'PUBLISHED' },
    });

    if (rows.length < 30 || publishedCount < 10) {
      const fallback = NICHE_FALLBACK[channel.niche ?? 'default'] ?? NICHE_FALLBACK.default;
      return {
        ...fallback,
        rationale: 'Insufficient analytics history; using niche heuristic.',
        confidence: 'low',
        publishAt: this.nextOccurrence(fallback.dayOfWeek, fallback.hour, channel.timezone),
      };
    }

    const buckets = new Map<string, { score: number; views: number; samples: number }>();
    for (const r of rows) {
      const key = `${r.dayOfWeek}-${r.hour}`;
      const prev = buckets.get(key) ?? { score: 0, views: 0, samples: 0 };
      const weight = (r.averageViewPct || 1) * (r.ctr || 1);
      buckets.set(key, {
        score: prev.score + r.views * weight,
        views: prev.views + r.views,
        samples: prev.samples + 1,
      });
    }

    let bestKey = '';
    let bestScore = -1;
    for (const [k, v] of buckets) {
      if (v.score > bestScore) {
        bestScore = v.score;
        bestKey = k;
      }
    }

    const [dayStr, hourStr] = bestKey.split('-');
    const dayOfWeek = Number(dayStr);
    const hour = Number(hourStr);

    return {
      dayOfWeek,
      hour,
      rationale: `Highest historical engagement bucket across ${rows.length} snapshots.`,
      confidence: rows.length > 200 ? 'high' : 'medium',
      publishAt: this.nextOccurrence(dayOfWeek, hour, channel.timezone),
    };
  }

  private nextOccurrence(dayOfWeek: number, hour: number, _timezone: string): Date {
    // Timezone-aware conversion would use a library like luxon; we keep UTC here
    // and let the frontend display in the channel's tz. Stored as UTC consistently.
    const now = new Date();
    const result = new Date(now);
    result.setUTCHours(hour, 0, 0, 0);
    const diff = (dayOfWeek - now.getUTCDay() + 7) % 7;
    result.setUTCDate(now.getUTCDate() + (diff === 0 && result <= now ? 7 : diff));
    return result;
  }
}
