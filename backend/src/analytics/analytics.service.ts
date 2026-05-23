import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboardSummary(userId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        title: true,
        subscriberCount: true,
        videoCount: true,
        viewCount: true,
      },
    });

    const totals = channels.reduce(
      (acc, c) => {
        acc.subscribers += c.subscriberCount;
        acc.videos += c.videoCount;
        acc.views += Number(c.viewCount);
        return acc;
      },
      { subscribers: 0, videos: 0, views: 0 },
    );

    const upcoming = await this.prisma.video.count({
      where: {
        channel: { userId },
        status: 'SCHEDULED',
        publishAt: { gte: new Date() },
      },
    });

    const failedLast7 = await this.prisma.video.count({
      where: {
        channel: { userId },
        status: 'FAILED',
        updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    return { channels, totals, upcomingScheduled: upcoming, failedLast7 };
  }

  async channelTimeseries(channelId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.analyticsSnapshot.findMany({
      where: { channelId, capturedAt: { gte: since } },
      orderBy: { capturedAt: 'asc' },
    });
  }
}
