import { Injectable, Logger } from '@nestjs/common';
import { CreationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelligenceService } from './intelligence.service';
import { ScriptService, Scene } from './script.service';
import { PixabayService } from './pixabay.service';
import { TtsService } from './tts.service';
import { MusicService } from './music.service';
import { SubtitlesService } from './subtitles.service';
import { RendererService } from './renderer.service';
import { StorageService } from './storage.service';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * End-to-end pipeline for a single VideoCreation row.
 *
 * Each stage updates the row's `status` so the dashboard can show real-time
 * progress. Failure at any stage flips status to FAILED with `failureReason`
 * populated, and emits a STUDIO_RENDER_FAILED notification.
 *
 * Stages:
 *  1. ANALYZING_CHANNEL   → IntelligenceService.analyze()
 *  2. GENERATING_SCRIPT   → ScriptService.generate()
 *  3. GENERATING_IMAGES   → PixabayService per scene
 *  4. GENERATING_AUDIO    → TtsService (full script concatenated)
 *  5. RENDERING           → RendererService.render()
 *  6. RENDERED            → asset URLs stored, ready for user approval
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: IntelligenceService,
    private readonly script: ScriptService,
    private readonly pixabay: PixabayService,
    private readonly tts: TtsService,
    private readonly music: MusicService,
    private readonly subtitles: SubtitlesService,
    private readonly renderer: RendererService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async runFull(creationId: string): Promise<void> {
    try {
      await this.storage.ensureBucket();

      const creation = await this.setStatus(creationId, CreationStatus.ANALYZING_CHANNEL);
      const style = await this.intelligence.analyze(creation.channelId);
      await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: { channelStyle: style as any },
      });

      await this.setStatus(creationId, CreationStatus.GENERATING_SCRIPT);
      const scenes = await this.script.generate(
        creation.topic,
        style,
        creation.style,
        creation.targetSeconds,
      );
      if (scenes.length === 0) throw new Error('Script generator returned no scenes');
      await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: { scenes: scenes as any, status: CreationStatus.SCRIPT_READY },
      });

      await this.setStatus(creationId, CreationStatus.GENERATING_IMAGES);
      const sceneImages: { scene: Scene; buffer: Buffer; path: string }[] = [];
      for (const scene of scenes) {
        const buf = await this.pixabay.searchAndDownload(scene.imageKeyword);
        const storagePath = `${creationId}/images/scene-${scene.index}.jpg`;
        await this.storage.upload(storagePath, buf, 'image/jpeg');
        sceneImages.push({ scene, buffer: buf, path: storagePath });
      }
      const scenesWithUrls = await Promise.all(
        sceneImages.map(async (si) => ({
          ...si.scene,
          imageUrl: await this.storage.signedUrl(si.path),
        })),
      );
      await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: { scenes: scenesWithUrls as any, status: CreationStatus.IMAGES_READY },
      });

      await this.setStatus(creationId, CreationStatus.GENERATING_AUDIO);
      const fullNarration = scenes.map((s) => s.narration).join(' ');
      const totalSeconds = scenes.reduce((a, s) => a + s.durationSeconds, 0);
      const voiceBuf = await this.tts.synthesize(fullNarration, totalSeconds);
      const voicePath = `${creationId}/audio/voice.mp3`;
      await this.storage.upload(voicePath, voiceBuf, 'audio/mpeg');

      const { trackId, buffer: musicBuf } = await this.music.pickTrack(fullNarration);
      let musicStoragePath: string | undefined;
      if (musicBuf) {
        musicStoragePath = `${creationId}/audio/music-${trackId}.mp3`;
        await this.storage.upload(musicStoragePath, musicBuf, 'audio/mpeg');
      }

      const srt = this.subtitles.build(scenes);
      const srtPath = `${creationId}/subs.srt`;
      await this.storage.upload(srtPath, Buffer.from(srt, 'utf8'), 'application/x-subrip');

      await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: {
          audioUrl: await this.storage.signedUrl(voicePath),
          musicUrl: musicStoragePath ? await this.storage.signedUrl(musicStoragePath) : null,
          subtitleUrl: await this.storage.signedUrl(srtPath),
          status: CreationStatus.AUDIO_READY,
        },
      });

      await this.setStatus(creationId, CreationStatus.RENDERING);
      const result = await this.renderer.render({
        scenes: sceneImages.map((si) => ({
          imageBuffer: si.buffer,
          durationSeconds: si.scene.durationSeconds,
        })),
        voiceoverBuffer: voiceBuf,
        musicBuffer: musicBuf,
        subtitleSrt: srt,
      });

      const renderPath = `${creationId}/final.mp4`;
      await this.storage.upload(renderPath, result.videoBuffer, 'video/mp4');
      const thumbPath = `${creationId}/thumbnail.jpg`;
      await this.storage.upload(thumbPath, result.thumbnailBuffer, 'image/jpeg');

      await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: {
          renderedUrl: await this.storage.signedUrl(renderPath, 7 * 24 * 3600),
          thumbnailUrl: await this.storage.signedUrl(thumbPath, 7 * 24 * 3600),
          finalDurationSeconds: result.durationSeconds,
          status: CreationStatus.RENDERED,
        },
      });

      const finalCreation = await this.prisma.videoCreation.findUnique({
        where: { id: creationId },
        include: { channel: true },
      });
      if (finalCreation) {
        await this.notifications.emit({
          userId: finalCreation.channel.userId,
          type: 'STUDIO_RENDER_READY',
          title: `Video ready to review: ${finalCreation.topic}`,
          data: { creationId },
        });
      }
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown failure';
      this.logger.error({ err, creationId }, 'Creation pipeline failed');
      const c = await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: { status: CreationStatus.FAILED, failureReason: message },
        include: { channel: true },
      });
      await this.notifications.emit({
        userId: c.channel.userId,
        type: 'STUDIO_RENDER_FAILED',
        title: `Studio render failed: ${c.topic}`,
        body: message.slice(0, 300),
        data: { creationId },
      });
      throw err;
    }
  }

  private async setStatus(id: string, status: CreationStatus) {
    return this.prisma.videoCreation.update({ where: { id }, data: { status } });
  }
}
