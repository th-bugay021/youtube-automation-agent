import { Module } from '@nestjs/common';
import { YoutubeClientFactory } from './youtube-client.factory';
import { YoutubeUploadService } from './youtube-upload.service';
import { YoutubeQuotaService } from './youtube-quota.service';

@Module({
  providers: [YoutubeClientFactory, YoutubeUploadService, YoutubeQuotaService],
  exports: [YoutubeClientFactory, YoutubeUploadService, YoutubeQuotaService],
})
export class YoutubeModule {}
