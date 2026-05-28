import { Injectable } from '@nestjs/common';
import { google, youtube_v3 } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { GoogleProfilePayload } from '../auth/auth.service';
import { YoutubeApiError } from '../common/filters/all-exceptions.filter';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * After Google OAuth, fetch the YouTube channels the user has authorised,
   * upsert them, and store encrypted OAuth credentials for each.
   *
   * This method MUST NOT throw on recoverable conditions (no channels on the
   * Google account, missing refresh token on re-consent, transient YouTube
   * API errors). The OAuth callback awaits this before issuing the session
   * cookie, so any throw here means the user never gets logged in. We log
   * loudly and return — the dashboard will simply show no channels, and the
   * user can re-link from settings.
   */
  async syncFromGoogleAuth(userId: string, profile: GoogleProfilePayload): Promise<void> {
    // Diagnostic — remove once OAuth flow is stable
    console.log('[ChannelsService.syncFromGoogleAuth]', {
      userId,
      email: profile.email,
      hasAccessToken: !!profile.accessToken,
      hasRefreshToken: !!profile.refreshToken,
      refreshTokenLength: profile.refreshToken?.length ?? 0,
      scope: profile.scope,
    });

    if (!profile.accessToken) {
      console.warn('[ChannelsService.syncFromGoogleAuth] no access token on profile — skipping sync');
      return;
    }

    const oauth = new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_REDIRECT_URI'),
    );
    oauth.setCredentials({
      access_token: profile.accessToken,
      refresh_token: profile.refreshToken,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth });

    let items: youtube_v3.Schema$Channel[] = [];
    try {
      const resp = await youtube.channels.list({ part: ['snippet', 'statistics'], mine: true });
      items = resp.data.items ?? [];
    } catch (err) {
      console.error('[ChannelsService.syncFromGoogleAuth] youtube.channels.list failed', {
        userId,
        message: (err as Error)?.message,
        stack: (err as Error)?.stack,
      });
      return;
    }

    if (items.length === 0) {
      console.warn('[ChannelsService.syncFromGoogleAuth] no YouTube channels on this Google account', {
        userId,
        email: profile.email,
      });
      return;
    }

    const expiresAt = new Date(Date.now() + profile.expiresIn * 1000);

    for (const item of items) {
      const ytId = item.id;
      if (!ytId) continue;

      try {
        const channel = await this.prisma.channel.upsert({
          where: { youtubeChannelId: ytId },
          create: {
            userId,
            youtubeChannelId: ytId,
            title: item.snippet?.title ?? 'Untitled channel',
            description: item.snippet?.description ?? null,
            thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? null,
            subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
            videoCount: Number(item.statistics?.videoCount ?? 0),
            viewCount: BigInt(item.statistics?.viewCount ?? 0),
          },
          update: {
            // youtubeChannelId is globally unique. Re-assign ownership to the
            // user who just authenticated, otherwise a channel previously
            // synced under a different user record stays hidden from this one.
            userId,
            title: item.snippet?.title ?? 'Untitled channel',
            description: item.snippet?.description ?? null,
            thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? null,
            subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
            videoCount: Number(item.statistics?.videoCount ?? 0),
            viewCount: BigInt(item.statistics?.viewCount ?? 0),
            isActive: true,
          },
        });

        const refreshToken = profile.refreshToken;
        if (!refreshToken) {
          // Google omits the refresh token on silent re-consent. Keep the
          // existing credential if we have one; otherwise leave the channel
          // visible but uncredentialed so the user can re-link from settings.
          const exists = await this.prisma.oAuthCredential.findUnique({
            where: { channelId: channel.id },
          });
          if (!exists) {
            console.warn(
              '[ChannelsService.syncFromGoogleAuth] no refresh token and no existing credential; channel saved without credential',
              { userId, channelId: channel.id, ytId },
            );
          }
          continue;
        }

        await this.prisma.oAuthCredential.upsert({
          where: { channelId: channel.id },
          create: {
            channelId: channel.id,
            accessTokenCipher: this.crypto.encrypt(profile.accessToken),
            refreshTokenCipher: this.crypto.encrypt(refreshToken),
            scope: profile.scope,
            expiresAt,
          },
          update: {
            accessTokenCipher: this.crypto.encrypt(profile.accessToken),
            refreshTokenCipher: this.crypto.encrypt(refreshToken),
            scope: profile.scope,
            expiresAt,
          },
        });
      } catch (err) {
        // One bad channel shouldn't drop the rest.
        console.error('[ChannelsService.syncFromGoogleAuth] failed to persist channel', {
          userId,
          ytId,
          message: (err as Error)?.message,
          stack: (err as Error)?.stack,
        });
      }
    }
  }

  async listForUser(userId: string) {
    return this.prisma.channel.findMany({ where: { userId } });
  }

  async getOwned(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, userId },
    });
    if (!channel) throw new YoutubeApiError('Channel not found or not owned');
    return channel;
  }

  async update(userId: string, channelId: string, dto: UpdateChannelDto) {
    await this.getOwned(userId, channelId);
    return this.prisma.channel.update({
      where: { id: channelId },
      data: dto,
    });
  }

  async disconnect(userId: string, channelId: string) {
    await this.getOwned(userId, channelId);
    await this.prisma.oAuthCredential.deleteMany({ where: { channelId } });
    await this.prisma.channel.update({
      where: { id: channelId },
      data: { isActive: false },
    });
    return { ok: true };
  }
}
