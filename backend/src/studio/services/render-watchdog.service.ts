import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

// A creation that has sat in any active (non-terminal) stage longer than this is
// presumed dead — the process running the pipeline died mid-job (crash, OOM,
// redeploy) so its in-process catch (which would otherwise flip the row to
// FAILED) never ran. Keep this above the Shotstack poll timeout so a merely-slow
// render isn't reaped while in flight; the earlier stages all finish well within
// it when healthy.
const STUCK_RENDER_MS = Number(process.env.RENDER_STUCK_TIMEOUT_MS) || 15 * 60 * 1000;

// Stages where the pipeline is actively executing inside runFull(). A row stale
// in any of these means the process never returned. DRAFT is excluded — it's a
// job waiting in the queue, not one mid-execution — as are the terminal states
// (RENDERED, APPROVED, FAILED).
const ACTIVE_STATUSES: CreationStatus[] = [
  CreationStatus.ANALYZING_CHANNEL,
  CreationStatus.GENERATING_SCRIPT,
  CreationStatus.SCRIPT_READY,
  CreationStatus.GENERATING_IMAGES,
  CreationStatus.IMAGES_READY,
  CreationStatus.GENERATING_AUDIO,
  CreationStatus.AUDIO_READY,
  CreationStatus.RENDERING,
];

@Injectable()
export class RenderWatchdogService {
  private readonly logger = new Logger(RenderWatchdogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reapStalledCreations(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_RENDER_MS);

    // updatedAt is bumped on every status change, so for a row still in an active
    // stage it marks when that stage began. Any healthy progress bumps it past
    // the cutoff; older than the cutoff means the process never came back.
    const stuck = await this.prisma.videoCreation.findMany({
      where: { status: { in: ACTIVE_STATUSES }, updatedAt: { lt: cutoff } },
      include: { channel: true },
    });
    if (stuck.length === 0) return;

    const minutes = Math.round(STUCK_RENDER_MS / 60000);
    for (const creation of stuck) {
      const reason = `Pipeline stalled in ${creation.status} for over ${minutes} minutes — the process likely ran out of memory or crashed mid-job`;

      // Guard the write on the exact status + timestamp we observed so we don't
      // clobber a creation that advanced to the next stage between the query and
      // the update.
      const res = await this.prisma.videoCreation.updateMany({
        where: {
          id: creation.id,
          status: creation.status,
          updatedAt: { lt: cutoff },
        },
        data: { status: CreationStatus.FAILED, failureReason: reason },
      });
      if (res.count === 0) continue;

      this.logger.warn(
        { creationId: creation.id, channelId: creation.channelId, stage: creation.status },
        'Reaped stalled creation',
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

