import { Injectable } from '@nestjs/common';
import { createReadStream, statSync } from 'fs';
import { YoutubeClientFactory } from './youtube-client.factory';
import { YoutubeQuotaService } from './youtube-quota.service';
import { YoutubeApiError } from '../common/filters/all-exceptions.filter';

export interface UploadInput {
  channelId: string;
  filePath: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  publishAt?: Date;
  thumbnailPath?: string;
  playlistId?: string;
}

export interface UploadResult {
  videoId: string;
  bytesSent: number;
}

@Injectable()
export class YoutubeUploadService {
  constructor(
    private readonly clientFactory: YoutubeClientFactory,
    private readonly quota: YoutubeQuotaService,
  ) {}

  async upload(input: UploadInput): Promise<UploadResult> {
    if (!(await this.quota.hasBudget(input.channelId, 1600))) {
      throw new YoutubeApiError('YouTube daily quota exhausted for this channel');
    }

    const { youtube } = await this.clientFactory.forChannel(input.channelId);
    const fileSize = statSync(input.filePath).size;

    const status: Record<string, unknown> = {
      privacyStatus: input.privacyStatus,
      selfDeclaredMadeForKids: false,
    };
    if (input.publishAt && input.privacyStatus === 'private') {
      status.publishAt = input.publishAt.toISOString();
    }

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: input.title,
          description: input.description ?? '',
          tags: input.tags ?? [],
          categoryId: input.categoryId ?? '22',
        },
        status,
      },
      media: { body: createReadStream(input.filePath) },
    });

    const videoId = res.data.id;
    if (!videoId) throw new YoutubeApiError('YouTube did not return a video ID');
    await this.quota.recordUpload(input.channelId);

    if (input.thumbnailPath) {
      try {
        await youtube.thumbnails.set({
          videoId,
          media: { body: createReadStream(input.thumbnailPath) },
        });
        await this.quota.record(input.channelId, 50);
      } catch (err) {
        throw new YoutubeApiError('Thumbnail upload failed', (err as Error).message);
      }
    }

    if (input.playlistId) {
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId: input.playlistId,
            resourceId: { kind: 'youtube#video', videoId },
          },
        },
      });
      await this.quota.record(input.channelId, 50);
    }

    return { videoId, bytesSent: fileSize };
  }
}
