import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { YoutubeModule } from '../youtube/youtube.module';
import { ChannelsModule } from '../channels/channels.module';
import { QUEUE_UPLOADS } from '../queue/queue.constants';

@Module({
  imports: [
    YoutubeModule,
    ChannelsModule,
    BullModule.registerQueue({ name: QUEUE_UPLOADS }),
  ],
  providers: [VideosService],
  controllers: [VideosController],
  exports: [VideosService],
})
export class VideosModule {}
