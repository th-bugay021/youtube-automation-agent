import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreationStatus, VideoStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { StorageService } from './services/storage.service';
import {
  ApproveCreationDto,
  CreateCreationDto,
  UpdateScriptDto,
} from './dto/studio.dto';
import { JOB_RUN_CREATION, QUEUE_STUDIO, QUEUE_UPLOADS, JOB_PUBLISH_VIDEO } from '../queue/queue.constants';
import { DomainError } from '../common/filters/all-exceptions.filter';

@Controller('studio')
@UseGuards(JwtAuthGuard)
export class StudioController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly scheduling: SchedulingService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE_STUDIO) private readonly studioQueue: Queue,
    @InjectQueue(QUEUE_UPLOADS) private readonly uploadsQueue: Queue,
  ) {}

  /** Start a new creation. Returns immediately; the worker picks it up. */
  @Post('creations')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCreationDto) {
    await this.channels.getOwned(user.id, dto.channelId);

    const creation = await this.prisma.videoCreation.create({
      data: {
        channelId: dto.channelId,
        style: dto.style,
        topic: dto.topic,
        niche: dto.niche,
        targetSeconds: dto.targetSeconds ?? 60,
        status: CreationStatus.DRAFT,
      },
    });

    await this.studioQueue.add(
      JOB_RUN_CREATION,
      { creationId: creation.id },
      { jobId: `creation-${creation.id}`, attempts: 1, removeOnComplete: { age: 86400 } },
    );

    return creation;
  }

  /** Polled by the wizard to render live progress. */
  @Get('creations/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.getOwned(user.id, id);
  }

  @Get('creations')
  async list(@CurrentUser() user: AuthUser) {
    return this.prisma.videoCreation.findMany({
      where: { channel: { userId: user.id } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { channel: { select: { id: true, title: true } } },
    });
  }

  /** Persist user edits to the AI-drafted script and refresh signed asset URLs. */
  @Post('creations/:id/script')
  async updateScript(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateScriptDto,
  ) {
    const creation = await this.getOwned(user.id, id);
    if (!['SCRIPT_READY', 'IMAGES_READY', 'AUDIO_READY', 'RENDERED'].includes(creation.status)) {
      throw new BadRequestException(`Cannot edit script in status ${creation.status}`);
    }
    const existing = (creation.scenes as any[] | null) ?? [];
    const merged = dto.scenes.map((edit) => {
      const existingScene = existing.find((s) => s.index === edit.index) ?? {};
      return {
        ...existingScene,
        ...edit,
      };
    });
    return this.prisma.videoCreation.update({
      where: { id },
      data: { scenes: merged as any },
    });
  }

  /** Re-run the pipeline from the script stage after edits. */
  @Post('creations/:id/regenerate')
  async regenerate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const creation = await this.getOwned(user.id, id);
    if (creation.status === CreationStatus.RENDERING) {
      throw new BadRequestException('Already rendering');
    }
    await this.prisma.videoCreation.update({
      where: { id },
      data: { status: CreationStatus.DRAFT, failureReason: null },
    });
    await this.studioQueue.add(
      JOB_RUN_CREATION,
      { creationId: id },
      { jobId: `creation-${id}-${Date.now()}`, attempts: 1, removeOnComplete: { age: 86400 } },
    );
    return { ok: true };
  }

  /** Suggest the optimal publish slot for this channel. */
  @Get('creations/:id/best-time')
  async bestTime(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const creation = await this.getOwned(user.id, id);
    return this.scheduling.suggestBestTime(creation.channelId);
  }

  /**
   * Approve a rendered creation: spawn a Video row in the existing publish
   * pipeline, schedule the upload, and link back to the creation.
   */
  @Post('creations/:id/approve')
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveCreationDto,
  ) {
    const creation = await this.getOwned(user.id, id);
    if (creation.status !== CreationStatus.RENDERED) {
      throw new DomainError('NOT_RENDERED', 'Creation must be RENDERED before approval', 409);
    }
    if (!creation.renderedUrl) {
      throw new DomainError('NO_RENDER', 'No rendered video available', 409);
    }

    // For the existing publish pipeline, we need a local file path. The Video
    // row's videoFilePath points to a Supabase Storage path; the upload worker
    // will download it just-in-time when it's time to push to YouTube.
    const renderedStoragePath = `${creation.id}/final.mp4`;

    const publishAt = dto.publishAt ? new Date(dto.publishAt) : new Date(Date.now() + 60_000);

    const video = await this.prisma.video.create({
      data: {
        channelId: creation.channelId,
        title: dto.title,
        description: dto.description ?? '',
        tags: dto.tags ?? [],
        privacyStatus: dto.privacyStatus ?? 'PRIVATE',
        videoFilePath: `supabase://${renderedStoragePath}`,
        thumbnailUrl: creation.thumbnailUrl ?? null,
        publishAt,
        status: VideoStatus.SCHEDULED,
        aiGenerated: true,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });

    await this.prisma.videoCreation.update({
      where: { id },
      data: {
        videoId: video.id,
        status: CreationStatus.APPROVED,
        approvedAt: new Date(),
      },
    });

    await this.uploadsQueue.add(
      JOB_PUBLISH_VIDEO,
      { videoId: video.id },
      {
        jobId: `video-${video.id}`,
        delay: Math.max(0, publishAt.getTime() - Date.now()),
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    );

    return { video, creationId: id };
  }

  /** Refreshes signed URLs that may have expired. */
  @Post('creations/:id/refresh-urls')
  async refreshUrls(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const creation = await this.getOwned(user.id, id);
    const updates: Record<string, string | null> = {};
    if (creation.renderedUrl) {
      updates.renderedUrl = await this.storage.signedUrl(`${id}/final.mp4`, 7 * 24 * 3600);
    }
    if (creation.thumbnailUrl) {
      updates.thumbnailUrl = await this.storage.signedUrl(`${id}/thumbnail.jpg`, 7 * 24 * 3600);
    }
    if (Object.keys(updates).length === 0) return creation;
    return this.prisma.videoCreation.update({ where: { id }, data: updates });
  }

  private async getOwned(userId: string, id: string) {
    const creation = await this.prisma.videoCreation.findFirst({
      where: { id, channel: { userId } },
    });
    if (!creation) throw new DomainError('NOT_FOUND', 'Creation not found', 404);
    return creation;
  }
}
