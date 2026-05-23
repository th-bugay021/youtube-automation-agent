import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { YoutubeClientFactory } from '../../youtube/youtube-client.factory';
import { JOB_FETCH_CHANNEL_STATS, JOB_REFRESH_ANALYTICS, QUEUE_ANALYTICS } from '../queue.constants';

@Processor(QUEUE_ANALYTICS)
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: YoutubeClientFactory,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_REFRESH_ANALYTICS:
        await this.refreshAll();
        break;
      case JOB_FETCH_CHANNEL_STATS:
        await this.refreshChannel((job.data as { channelId: string }).channelId);
        break;
    }
  }

  private async refreshAll(): Promise<void> {
    const channels = await this.prisma.channel.findMany({ where: { isActive: true } });
    for (const c of channels) {
      try {
        await this.refreshChannel(c.id);
      } catch (err) {
        this.logger.warn({ err, channelId: c.id }, 'analytics refresh failed');
      }
    }
  }

  private async refreshChannel(channelId: string): Promise<void> {
    const { youtube } = await this.clientFactory.forChannel(channelId);
    const ch = await youtube.channels.list({ part: ['statistics'], mine: true });
    const stats = ch.data.items?.[0]?.statistics;
    if (stats) {
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          subscriberCount: Number(stats.subscriberCount ?? 0),
          videoCount: Number(stats.videoCount ?? 0),
          viewCount: BigInt(stats.viewCount ?? 0),
        },
      });
    }

    // Per-video metrics snapshot for published videos owned by this channel.
    const videos = await this.prisma.video.findMany({
      where: { channelId, status: 'PUBLISHED', youtubeVideoId: { not: null } },
      select: { id: true, youtubeVideoId: true },
      take: 50,
    });
    const ids = videos.map((v) => v.youtubeVideoId!).filter(Boolean);
    if (ids.length === 0) return;

    const resp = await youtube.videos.list({ part: ['statistics'], id: ids });
    for (const item of resp.data.items ?? []) {
      const v = videos.find((x) => x.youtubeVideoId === item.id);
      if (!v) continue;
      await this.prisma.videoMetric.create({
        data: {
          videoId: v.id,
          views: BigInt(item.statistics?.viewCount ?? 0),
          likes: Number(item.statistics?.likeCount ?? 0),
          comments: Number(item.statistics?.commentCount ?? 0),
        },
      });
    }
  }
}
