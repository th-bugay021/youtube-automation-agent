import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UploadsProcessor } from './processors/uploads.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { QueueScheduler } from './queue.scheduler';
import { YoutubeModule } from '../youtube/youtube.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageService } from '../studio/services/storage.service';
import { QUEUE_ANALYTICS, QUEUE_UPLOADS } from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_UPLOADS }, { name: QUEUE_ANALYTICS }),
    YoutubeModule,
    NotificationsModule,
  ],
  providers: [UploadsProcessor, AnalyticsProcessor, QueueScheduler, StorageService],
  exports: [BullModule],
})
export class QueueModule {}
