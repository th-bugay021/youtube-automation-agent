import { Module, forwardRef } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { YoutubeModule } from '../youtube/youtube.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [YoutubeModule, forwardRef(() => AuthModule)],
  providers: [ChannelsService],
  controllers: [ChannelsController],
  exports: [ChannelsService],
})
export class ChannelsModule {}
