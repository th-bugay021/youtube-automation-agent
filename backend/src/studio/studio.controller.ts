import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreationStatus, VideoStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { StorageService } from './services/storage.service';
import { PixabayService } from './services/pixabay.service';
import {
  ApproveCreationDto,
  CreateCreationDto,
  RefreshSceneAssetDto,
  UpdateScriptDto,
} from './dto/studio.dto';
import {
  JOB_RUN_CREATION,
  JOB_RENDER_CREATION,
  QUEUE_STUDIO,
  QUEUE_UPLOADS,
  JOB_PUBLISH_VIDEO,
} from '../queue/queue.constants';
import { DomainError } from '../common/filters/all-exceptions.filter';

// Custom scene images Shotstack must be able to fetch. Keep in step with the
// accept filter on the frontend file picker.
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

@Controller('studio')
@UseGuards(JwtAuthGuard)
export class StudioController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly scheduling: SchedulingService,
    private readonly storage: StorageService,
    private readonly pixabay: PixabayService,
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
        tone: dto.tone,
        format: dto.format,
        hookStyle: dto.hookStyle,
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

  /**
   * Re-fetch the stock asset for a single scene using a (possibly user-edited)
   * keyword. Faceless creations pull a fresh video clip; every other style pulls
   * a still image. Persists the new keyword + asset URL onto that one scene and
   * returns it, so the editor can swap the preview without re-running the whole
   * pipeline.
   */
  @Post('creations/:id/scenes/:index/refresh-asset')
  async refreshSceneAsset(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: RefreshSceneAssetDto,
  ) {
    const creation = await this.getOwned(user.id, id);
    if (!['SCRIPT_READY', 'IMAGES_READY', 'AUDIO_READY', 'RENDERED'].includes(creation.status)) {
      throw new BadRequestException(`Cannot edit assets in status ${creation.status}`);
    }

    const sceneIndex = Number(index);
    if (!Number.isInteger(sceneIndex)) {
      throw new BadRequestException('Scene index must be an integer');
    }
    const scenes = (creation.scenes as any[] | null) ?? [];
    const pos = scenes.findIndex((s) => s.index === sceneIndex);
    if (pos === -1) throw new BadRequestException(`Scene ${index} not found`);

    const scene = scenes[pos];
    const keyword = (dto.imageKeyword ?? scene.imageKeyword ?? '').trim();
    if (!keyword) throw new BadRequestException('A keyword is required to fetch an asset');

    await this.storage.ensureBucket();
    // Sign for a generous editing-session window so the swapped preview doesn't
    // expire while the user keeps working.
    const ASSET_URL_TTL = 24 * 60 * 60;

    let updatedScene: Record<string, unknown>;
    if (creation.style === 'FACELESS') {
      const buf = await this.pixabay.searchAndDownloadVideo(keyword, scene.durationSeconds ?? 0);
      if (buf) {
        const path = `${id}/clips/scene-${sceneIndex}.mp4`;
        await this.storage.upload(path, buf, 'video/mp4');
        const url = await this.storage.signedUrl(path, ASSET_URL_TTL);
        // Drop any stale image URL so the scene resolves cleanly to a video.
        // A fresh stock asset supersedes any earlier custom upload.
        updatedScene = {
          ...scene,
          imageKeyword: keyword,
          videoUrl: url,
          imageUrl: null,
          customImagePath: null,
        };
      } else {
        // No stock clip fit the size budget; fall back to a still image so the
        // refresh still produces a usable scene instead of failing.
        const imgBuf = await this.pixabay.searchAndDownload(keyword);
        const path = `${id}/images/scene-${sceneIndex}.jpg`;
        await this.storage.upload(path, imgBuf, 'image/jpeg');
        const url = await this.storage.signedUrl(path, ASSET_URL_TTL);
        // Drop any stale video URL so the scene resolves cleanly to an image.
        updatedScene = {
          ...scene,
          imageKeyword: keyword,
          imageUrl: url,
          videoUrl: null,
          customImagePath: null,
        };
      }
    } else {
      const buf = await this.pixabay.searchAndDownload(keyword);
      const path = `${id}/images/scene-${sceneIndex}.jpg`;
      await this.storage.upload(path, buf, 'image/jpeg');
      const url = await this.storage.signedUrl(path, ASSET_URL_TTL);
      updatedScene = {
        ...scene,
        imageKeyword: keyword,
        imageUrl: url,
        videoUrl: null,
        customImagePath: null,
      };
    }

    const nextScenes = [...scenes];
    nextScenes[pos] = updatedScene;
    await this.prisma.videoCreation.update({
      where: { id },
      data: { scenes: nextScenes as any },
    });
    return updatedScene;
  }

  /**
   * Upload a custom image for one scene. The image is stored in Supabase under a
   * deterministic per-scene path and recorded on the scene as `customImagePath`,
   * which overrides the stock asset at render time. Replaces the scene's preview
   * (imageUrl) and clears any video URL so the scene resolves to the image.
   */
  @Post('creations/:id/scenes/:index/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  async uploadSceneImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('index') index: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
  ) {
    const creation = await this.getOwned(user.id, id);
    if (!['SCRIPT_READY', 'IMAGES_READY', 'AUDIO_READY', 'RENDERED'].includes(creation.status)) {
      throw new BadRequestException(`Cannot edit assets in status ${creation.status}`);
    }
    if (!file) throw new BadRequestException('No image file provided');
    if (!ALLOWED_IMAGE_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Image must be JPG, PNG, or WEBP');
    }

    const sceneIndex = Number(index);
    if (!Number.isInteger(sceneIndex)) {
      throw new BadRequestException('Scene index must be an integer');
    }
    const scenes = (creation.scenes as any[] | null) ?? [];
    const pos = scenes.findIndex((s) => s.index === sceneIndex);
    if (pos === -1) throw new BadRequestException(`Scene ${index} not found`);

    await this.storage.ensureBucket();
    // Custom uploads live under a dedicated prefix so they never collide with the
    // pipeline's stock images at `${id}/images/...`. The render-only pipeline
    // signs this exact path, so Shotstack always fetches the user's image.
    const path = `${id}/scene-images/${sceneIndex}.jpg`;
    await this.storage.upload(path, file.buffer, file.mimetype);
    // Sign for a generous editing-session window so the preview doesn't expire
    // while the user keeps working before rendering.
    const url = await this.storage.signedUrl(path, 24 * 60 * 60);

    const updatedScene = {
      ...scenes[pos],
      customImagePath: path,
      imageUrl: url,
      videoUrl: null,
    };
    const nextScenes = [...scenes];
    nextScenes[pos] = updatedScene;
    await this.prisma.videoCreation.update({
      where: { id },
      data: { scenes: nextScenes as any },
    });
    return updatedScene;
  }

  /**
   * Scene-editor "Save & Render": re-render the already-generated scenes with
   * the user's edited images, motion effects, and durations — without rerunning
   * the script/image/audio stages. Requires assets to already exist (the video
   * has been rendered at least once), so allowed only from AUDIO_READY/RENDERED.
   */
  @Post('creations/:id/render')
  async render(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const creation = await this.getOwned(user.id, id);
    if (creation.status === CreationStatus.RENDERING) {
      // Same stuck-render guard as regenerate: only block a render that is still
      // plausibly alive.
      const ageMs = Date.now() - creation.updatedAt.getTime();
      const stuckMs = Number(process.env.RENDER_STUCK_TIMEOUT_MS) || 15 * 60 * 1000;
      if (ageMs < stuckMs) throw new BadRequestException('Already rendering');
    } else if (!['AUDIO_READY', 'RENDERED'].includes(creation.status)) {
      throw new BadRequestException(
        `Render the video once before using the scene editor (status ${creation.status})`,
      );
    }
    await this.prisma.videoCreation.update({
      where: { id },
      data: { failureReason: null },
    });
    await this.studioQueue.add(
      JOB_RENDER_CREATION,
      { creationId: id },
      {
        jobId: `creation-${id}-render-${Date.now()}`,
        attempts: 1,
        removeOnComplete: { age: 86400 },
      },
    );
    return { ok: true };
  }

  /** Re-run the pipeline from the script stage after edits. */
  @Post('creations/:id/regenerate')
  async regenerate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const creation = await this.getOwned(user.id, id);
    if (creation.status === CreationStatus.RENDERING) {
      // Only block if the render is still plausibly alive. A row whose
      // updatedAt is older than the stuck threshold means the worker died
      // mid-render (typically OOM) and the row will never advance on its own —
      // allow the user to re-render immediately instead of waiting for the
      // watchdog to reap it.
      const ageMs = Date.now() - creation.updatedAt.getTime();
      const stuckMs = Number(process.env.RENDER_STUCK_TIMEOUT_MS) || 15 * 60 * 1000;
      if (ageMs < stuckMs) {
        throw new BadRequestException('Already rendering');
      }
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
