import { Injectable, Logger } from '@nestjs/common';
import { CreationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelligenceService, ChannelStyleProfile } from './intelligence.service';
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
      // Faceless videos use stock video clips per scene; every other style
      // (slideshow, and the preview styles) uses still images.
      const isFaceless = creation.style === 'FACELESS';
      const auto = await this.intelligence.analyze(creation.channelId);

      // Apply manual style overrides on top of the auto-detected profile, with
      // precedence: per-video (creation) value > saved channel default >
      // auto-detected. This lets users correct a mis-detected niche/tone/etc.
      const channel = await this.prisma.channel.findUnique({ where: { id: creation.channelId } });
      const style: ChannelStyleProfile = {
        ...auto,
        niche: creation.niche ?? channel?.niche ?? auto.niche,
        tone: creation.tone ?? channel?.defaultTone ?? auto.tone,
        format: creation.format ?? channel?.defaultFormat ?? auto.format,
        hookStyle: creation.hookStyle ?? channel?.defaultHookStyle ?? auto.hookStyle,
      };
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
      // Each scene gets a visual asset: a stock video clip (faceless) or a still
      // image (slideshow). `isVideo` drives both the render timeline and the
      // public scene URL field downstream.
      const sceneAssets: { scene: Scene; path: string; isVideo: boolean }[] = [];
      let thumbnailBuffer: Buffer | undefined;
      for (const scene of scenes) {
        if (isFaceless) {
          const buf = await this.pixabay.searchAndDownloadVideo(
            scene.imageKeyword,
            scene.durationSeconds,
          );
          const storagePath = `${creationId}/clips/scene-${scene.index}.mp4`;
          await this.storage.upload(storagePath, buf, 'video/mp4');
          sceneAssets.push({ scene, path: storagePath, isVideo: true });
        } else {
          const buf = await this.pixabay.searchAndDownload(scene.imageKeyword);
          const storagePath = `${creationId}/images/scene-${scene.index}.jpg`;
          await this.storage.upload(storagePath, buf, 'image/jpeg');
          if (!thumbnailBuffer) thumbnailBuffer = buf;
          sceneAssets.push({ scene, path: storagePath, isVideo: false });
        }
      }
      // Faceless videos have no still frames to reuse, so fetch one stock image
      // for the thumbnail. Non-fatal: a missing thumbnail just falls back to the
      // one YouTube auto-generates.
      if (isFaceless) {
        thumbnailBuffer = await this.pixabay
          .searchAndDownload(scenes[0].imageKeyword)
          .catch(() => undefined);
      }
      const scenesWithUrls = await Promise.all(
        sceneAssets.map(async (sa) => {
          const url = await this.storage.signedUrl(sa.path);
          return { ...sa.scene, ...(sa.isVideo ? { videoUrl: url } : { imageUrl: url }) };
        }),
      );
      await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: { scenes: scenesWithUrls as any, status: CreationStatus.IMAGES_READY },
      });

      await this.setStatus(creationId, CreationStatus.GENERATING_AUDIO);

      // Per-scene voiceover: each scene gets its own gTTS clip. The measured
      // audio length becomes the scene's on-screen duration (with a small floor
      // and tail pad) so the image stays up exactly as long as its narration.
      const MIN_SCENE_SECONDS = 2;
      const TAIL_PAD_SECONDS = 0.4;
      // Space out per-scene TTS calls to avoid tripping gTTS rate limits.
      const SCENE_TTS_DELAY_MS = Number(process.env.TTS_SCENE_DELAY_MS) || 600;
      for (let i = 0; i < sceneAssets.length; i++) {
        const si = sceneAssets[i];
        const { buffer, durationSeconds } = await this.tts.synthesizeScene(
          si.scene.narration,
          si.scene.durationSeconds,
        );
        const audioPath = `${creationId}/audio/scene-${si.scene.index}.mp3`;
        await this.storage.upload(audioPath, buffer, 'audio/mpeg');
        // Mutate the authoritative duration so subtitles, totals, and the
        // render timeline all agree on the real narration length.
        si.scene.durationSeconds = Number(
          Math.max(MIN_SCENE_SECONDS, durationSeconds + TAIL_PAD_SECONDS).toFixed(3),
        );
        if (i < sceneAssets.length - 1 && SCENE_TTS_DELAY_MS > 0) {
          await new Promise((resolve) => setTimeout(resolve, SCENE_TTS_DELAY_MS));
        }
      }
      const totalSeconds = sceneAssets.reduce((a, si) => a + si.scene.durationSeconds, 0);

      const fullNarration = scenes.map((s) => s.narration).join(' ');
      const { url: musicUrl } = await this.music.pickTrack(fullNarration);

      // Subtitles + scene URLs use the now-updated per-scene durations.
      const srt = this.subtitles.build(scenes);
      const srtPath = `${creationId}/subs.srt`;
      await this.storage.upload(srtPath, Buffer.from(srt, 'utf8'), 'application/x-subrip');

      const scenesWithAudio = await Promise.all(
        sceneAssets.map(async (sa) => {
          const url = await this.storage.signedUrl(sa.path);
          return {
            ...sa.scene,
            ...(sa.isVideo ? { videoUrl: url } : { imageUrl: url }),
            audioUrl: await this.storage.signedUrl(`${creationId}/audio/scene-${sa.scene.index}.mp3`),
          };
        }),
      );
      await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: {
          scenes: scenesWithAudio as any,
          audioUrl: scenesWithAudio[0]?.audioUrl ?? null,
          musicUrl,
          subtitleUrl: await this.storage.signedUrl(srtPath),
          status: CreationStatus.AUDIO_READY,
        },
      });

      await this.setStatus(creationId, CreationStatus.RENDERING);

      // Shotstack fetches assets over HTTP, so give it signed URLs valid well
      // past the render+poll window (images and per-scene voice live in
      // Supabase). Music is a public CDN URL, used as-is.
      const RENDER_URL_TTL = 2 * 60 * 60; // 2h
      const sceneRenderInputs = await Promise.all(
        sceneAssets.map(async (sa) => {
          const assetUrl = await this.storage.signedUrl(sa.path, RENDER_URL_TTL);
          return {
            ...(sa.isVideo ? { videoUrl: assetUrl } : { imageUrl: assetUrl }),
            audioUrl: await this.storage.signedUrl(
              `${creationId}/audio/scene-${sa.scene.index}.mp3`,
              RENDER_URL_TTL,
            ),
            durationSeconds: sa.scene.durationSeconds,
          };
        }),
      );
      const result = await this.renderer.render({
        scenes: sceneRenderInputs,
        musicUrl,
        totalDurationSeconds: totalSeconds,
      });

      // Copy the hosted MP4 into Supabase so the downstream YouTube-upload
      // pipeline (which reads `supabase://<id>/final.mp4`) is unchanged.
      const renderResp = await fetch(result.videoUrl);
      if (!renderResp.ok) {
        throw new Error(`Failed to download Shotstack output: ${renderResp.status}`);
      }
      const videoBuffer = Buffer.from(await renderResp.arrayBuffer());

      const renderPath = `${creationId}/final.mp4`;
      await this.storage.upload(renderPath, videoBuffer, 'video/mp4');
      // Thumbnail: a stock still (slideshow reuses scene 1's image; faceless
      // fetched one separately). Skipped if none was available.
      let thumbnailUrl: string | null = null;
      if (thumbnailBuffer) {
        const thumbPath = `${creationId}/thumbnail.jpg`;
        await this.storage.upload(thumbPath, thumbnailBuffer, 'image/jpeg');
        thumbnailUrl = await this.storage.signedUrl(thumbPath, 7 * 24 * 3600);
      }

      await this.prisma.videoCreation.update({
        where: { id: creationId },
        data: {
          renderedUrl: await this.storage.signedUrl(renderPath, 7 * 24 * 3600),
          thumbnailUrl,
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
