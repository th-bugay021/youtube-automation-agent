import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAILY_LIMIT = 10_000;
const COST_UPLOAD = 1600;
const COST_LIST = 1;

@Injectable()
export class YoutubeQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async hasBudget(channelId: string, cost: number): Promise<boolean> {
    const used = await this.usedToday(channelId);
    return used + cost <= DAILY_LIMIT;
  }

  async recordUpload(channelId: string): Promise<void> {
    await this.record(channelId, COST_UPLOAD);
  }

  async recordList(channelId: string): Promise<void> {
    await this.record(channelId, COST_LIST);
  }

  async record(channelId: string, units: number): Promise<void> {
    const day = this.dayKey();
    await this.prisma.youtubeQuotaUsage.upsert({
      where: { channelId_day: { channelId, day } },
      create: { channelId, day, unitsUsed: units },
      update: { unitsUsed: { increment: units } },
    });
  }

  async usedToday(channelId: string): Promise<number> {
    const day = this.dayKey();
    const row = await this.prisma.youtubeQuotaUsage.findUnique({
      where: { channelId_day: { channelId, day } },
    });
    return row?.unitsUsed ?? 0;
  }

  private dayKey(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}
