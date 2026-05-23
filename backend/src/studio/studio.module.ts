import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StudioController } from './studio.controller';
import { StorageService } from './services/storage.service';
import { PixabayService } from './services/pixabay.service';
import { IntelligenceService } from './services/intelligence.service';
import { ScriptService } from './services/script.service';
import { TtsService } from './services/tts.service';
import { MusicService } from './services/music.service';
import { SubtitlesService } from './services/subtitles.service';
import { RendererService } from './services/renderer.service';
import { OrchestratorService } from './services/orchestrator.service';
import { StudioProcessor } from './processors/studio.processor';
import { AiModule } from '../ai/ai.module';
import { ChannelsModule } from '../channels/channels.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QUEUE_STUDIO, QUEUE_UPLOADS } from '../queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_STUDIO }, { name: QUEUE_UPLOADS }),
    AiModule,
    ChannelsModule,
    SchedulingModule,
    NotificationsModule,
  ],
  controllers: [StudioController],
  providers: [
    StorageService,
    PixabayService,
    IntelligenceService,
    ScriptService,
    TtsService,
    MusicService,
    SubtitlesService,
    RendererService,
    OrchestratorService,
    StudioProcessor,
  ],
  exports: [StorageService],
})
export class StudioModule {}
