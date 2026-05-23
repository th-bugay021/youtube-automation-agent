import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_ANALYTICS, JOB_REFRESH_ANALYTICS } from './queue.constants';

@Injectable()
export class QueueScheduler {
  private readonly logger = new Logger(QueueScheduler.name);

  constructor(@InjectQueue(QUEUE_ANALYTICS) private readonly analytics: Queue) {}

  // Refresh analytics for all active channels every 6 hours.
  @Cron(CronExpression.EVERY_6_HOURS)
  async refreshAnalytics(): Promise<void> {
    this.logger.log('Enqueuing analytics refresh');
    await this.analytics.add(
      JOB_REFRESH_ANALYTICS,
      {},
      { jobId: `refresh-${Date.now()}`, removeOnComplete: true, removeOnFail: 100 },
    );
  }
}
