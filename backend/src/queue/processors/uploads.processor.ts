import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { YoutubeUploadService } from '../../youtube/youtube-upload.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { StorageService } from '../../studio/services/storage.service';
import { JOB_PUBLISH_VIDEO, QUEUE_UPLOADS } from '../queue.constants';
import { AutomationMode, VideoStatus } from '@prisma/client';

@Processor(QUEUE_UPLOADS)
export class UploadsProcessor extends WorkerHost {
  private readonly logger = new Logger(UploadsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: YoutubeUploadService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<{ videoId: string }>): Promise<void> {
    if (job.name !== JOB_PUBLISH_VIDEO) return;
    const { videoId } = job.data;

    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: { channel: true },
    });
    if (!video) {
      this.logger.warn(`Video ${videoId} disappeared before upload`);
      return;
    }
    if (video.status === VideoStatus.PUBLISHED) return;
    if (video.status === VideoStatus.CANCELLED) return;

    if (video.channel.automationMode === AutomationMode.MANUAL && !video.approvedAt) {
      this.logger.warn(`Video ${videoId} skipped — manual mode without approval`);
      return;
    }
    if (!video.videoFilePath) {
      await this.markFailed(videoId, 'Missing video file');
      return;
    }

    await this.prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.UPLOADING },
    });

    let tempPath: string | null = null;
    let tempThumbPath: string | null = null;
    try {
      // Studio-rendered videos store a `supabase://<path>` reference. The
      // YouTube upload API needs a real file on disk, so we materialise it
      // into a temp file, upload, then delete.
      let localPath = video.videoFilePath;
      if (localPath.startsWith('supabase://')) {
        const storagePath = localPath.slice('supabase://'.length);
        const buf = await this.storage.download(storagePath);
        tempPath = path.join(os.tmpdir(), `upload-${videoId}.mp4`);
        await fs.writeFile(tempPath, buf);
        localPath = tempPath;
      }

      // Thumbnails: studio renders store a signed Supabase URL, so any http(s)
      // URL is downloaded to a temp file (the YouTube thumbnails.set API streams
      // from disk). A non-http value is treated as an existing local path.
      // A thumbnail failure must never block the video publish.
      let thumbnailPath: string | undefined;
      if (video.thumbnailUrl?.startsWith('http')) {
        try {
          const resp = await fetch(video.thumbnailUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          tempThumbPath = path.join(os.tmpdir(), `thumb-${videoId}.jpg`);
          await fs.writeFile(tempThumbPath, Buffer.from(await resp.arrayBuffer()));
          thumbnailPath = tempThumbPath;
        } catch (err) {
          this.logger.warn(
            `Thumbnail download failed for ${videoId} (${(err as Error).message}); publishing without a custom thumbnail`,
          );
        }
      } else if (video.thumbnailUrl) {
        thumbnailPath = video.thumbnailUrl;
      }

      const result = await this.upload.upload({
        channelId: video.channelId,
        filePath: localPath,
        title: video.title,
        description: video.description ?? undefined,
        tags: video.tags,
        categoryId: video.categoryId ?? '22',
        privacyStatus: this.mapPrivacy(video.privacyStatus),
        publishAt: video.publishAt ?? undefined,
        thumbnailPath,
        playlistId: video.playlistId ?? undefined,
      });

      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          status: VideoStatus.PUBLISHED,
          youtubeVideoId: result.videoId,
          publishedAt: new Date(),
          failureReason: null,
        },
      });

      await this.notifications.emit({
        userId: video.channel.userId,
        type: 'UPLOAD_SUCCESS',
        title: `Published: ${video.title}`,
        body: `https://youtube.com/watch?v=${result.videoId}`,
        data: { videoId, youtubeVideoId: result.videoId },
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error({ err }, `Upload failed for ${videoId}`);
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          retryCount: { increment: 1 },
          failureReason: message,
        },
      });
      if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
        await this.markFailed(videoId, message);
      }
      throw err;
    } finally {
      if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
      if (tempThumbPath) await fs.unlink(tempThumbPath).catch(() => undefined);
    }
  }

  private async markFailed(videoId: string, reason: string): Promise<void> {
    const video = await this.prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.FAILED, failureReason: reason },
      include: { channel: true },
    });
    await this.notifications.emit({
      userId: video.channel.userId,
      type: 'UPLOAD_FAILED',
      title: `Upload failed: ${video.title}`,
      body: reason,
      data: { videoId },
    });
  }

  private mapPrivacy(p: 'PUBLIC' | 'UNLISTED' | 'PRIVATE'): 'public' | 'unlisted' | 'private' {
    return p.toLowerCase() as 'public' | 'unlisted' | 'private';
  }
}
