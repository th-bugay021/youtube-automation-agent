import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Video, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { CreateVideoDto, UpdateVideoDto, ApproveVideoDto } from './dto/video.dto';
import { JOB_PUBLISH_VIDEO, QUEUE_UPLOADS } from '../queue/queue.constants';
import { DomainError } from '../common/filters/all-exceptions.filter';

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    @InjectQueue(QUEUE_UPLOADS) private readonly uploads: Queue,
  ) {}

  async create(userId: string, dto: CreateVideoDto): Promise<Video> {
    await this.channels.getOwned(userId, dto.channelId);
    return this.prisma.video.create({
      data: {
        channelId: dto.channelId,
        title: dto.title,
        description: dto.description,
        tags: dto.tags ?? [],
        hashtags: dto.hashtags ?? [],
        privacyStatus: dto.privacyStatus ?? 'PRIVATE',
        categoryId: dto.categoryId,
        playlistId: dto.playlistId,
        videoFilePath: dto.videoFilePath,
        thumbnailUrl: dto.thumbnailUrl,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
        aiGenerated: dto.aiGenerated ?? false,
        status: dto.aiGenerated ? 'AI_GENERATED' : 'DRAFT',
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateVideoDto): Promise<Video> {
    const video = await this.getOwned(userId, id);
    if (['UPLOADING', 'PUBLISHED'].includes(video.status)) {
      throw new DomainError('IMMUTABLE', 'Cannot edit a video being uploaded or already published', 409);
    }
    return this.prisma.video.update({
      where: { id },
      data: {
        ...dto,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : undefined,
      },
    });
  }

  async approve(userId: string, id: string, dto: ApproveVideoDto): Promise<Video> {
    const video = await this.getOwned(userId, id);
    if (!video.videoFilePath) {
      throw new DomainError('NO_FILE', 'Video file must be attached before approval', 400);
    }
    const publishAt = dto.publishAt ? new Date(dto.publishAt) : (video.publishAt ?? new Date());
    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        status: VideoStatus.SCHEDULED,
        approvedById: userId,
        approvedAt: new Date(),
        publishAt,
      },
    });
    await this.scheduleUpload(updated.id, publishAt);
    return updated;
  }

  async cancel(userId: string, id: string): Promise<Video> {
    const video = await this.getOwned(userId, id);
    if (['UPLOADING', 'PUBLISHED'].includes(video.status)) {
      throw new DomainError('IMMUTABLE', 'Cannot cancel after upload starts', 409);
    }
    await this.uploads.remove(`video-${id}`).catch(() => undefined);
    return this.prisma.video.update({
      where: { id },
      data: { status: VideoStatus.CANCELLED },
    });
  }

  async listForChannel(userId: string, channelId: string, status?: VideoStatus) {
    await this.channels.getOwned(userId, channelId);
    return this.prisma.video.findMany({
      where: { channelId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listQueue(userId: string) {
    return this.prisma.video.findMany({
      where: {
        channel: { userId },
        status: { in: ['SCHEDULED', 'PENDING_APPROVAL', 'AI_GENERATED', 'UPLOADING', 'FAILED'] },
      },
      orderBy: { publishAt: 'asc' },
      include: { channel: { select: { id: true, title: true, thumbnailUrl: true } } },
    });
  }

  async getOwned(userId: string, id: string): Promise<Video> {
    const video = await this.prisma.video.findFirst({
      where: { id, channel: { userId } },
    });
    if (!video) throw new DomainError('NOT_FOUND', 'Video not found', 404);
    return video;
  }

  private async scheduleUpload(videoId: string, publishAt: Date): Promise<void> {
    const delay = Math.max(0, publishAt.getTime() - Date.now());
    await this.uploads.add(
      JOB_PUBLISH_VIDEO,
      { videoId },
      {
        jobId: `video-${videoId}`,
        delay,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60 },
        removeOnFail: false,
      },
    );
  }
}
