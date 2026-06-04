import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

// A creation that has sat in RENDERING longer than this is presumed dead — the
// worker was almost certainly OOM-killed mid-render, so its in-process catch
// (which would otherwise flip the row to FAILED) never ran. Keep this above the
// ffmpeg timeout so a merely-slow render isn't reaped while still progressing.
const STUCK_RENDER_MS = Number(process.env.RENDER_STUCK_TIMEOUT_MS) || 10 * 60 * 1000;

@Injectable()
export class RenderWatchdogService {
  private readonly logger = new Logger(RenderWatchdogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reapStuckRenders(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_RENDER_MS);

    // updatedAt is bumped on every status change, so for a row still in
    // RENDERING it marks when the render stage began. Older than the cutoff
    // means the process never came back.
    const stuck = await this.prisma.videoCreation.findMany({
      where: { status: CreationStatus.RENDERING, updatedAt: { lt: cutoff } },
      include: { channel: true },
    });
    if (stuck.length === 0) return;

    for (const creation of stuck) {
      // Guard the write on the status + timestamp we observed so we don't
      // clobber a render that resumed between the query and the update.
      const reason = `Render timed out (stuck in RENDERING for over ${Math.round(
        STUCK_RENDER_MS / 60000,
      )} minutes — worker likely ran out of memory)`;

      const res = await this.prisma.videoCreation.updateMany({
        where: {
          id: creation.id,
          status: CreationStatus.RENDERING,
          updatedAt: { lt: cutoff },
        },
        data: { status: CreationStatus.FAILED, failureReason: reason },
      });
      if (res.count === 0) continue;

      this.logger.warn(
        { creationId: creation.id, channelId: creation.channelId },
        'Reaped stuck render',
      );
      await this.notifications.emit({
        userId: creation.channel.userId,
        type: 'STUDIO_RENDER_FAILED',
        title: `Studio render failed: ${creation.topic}`,
        body: reason,
        data: { creationId: creation.id },
      });
    }
  }
}

