import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
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
    const resp = await youtube.channels.list({ part: ['snippet', 'statistics'], mine: true });
    const items = resp.data.items ?? [];
    if (items.length === 0) {
      throw new YoutubeApiError('No YouTube channels found for this Google account');
    }

    const expiresAt = new Date(Date.now() + profile.expiresIn * 1000);

    for (const item of items) {
      const ytId = item.id;
      if (!ytId) continue;

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
          title: item.snippet?.title ?? 'Untitled channel',
          description: item.snippet?.description ?? null,
          thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? null,
          subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
          videoCount: Number(item.statistics?.videoCount ?? 0),
          viewCount: BigInt(item.statistics?.viewCount ?? 0),
        },
      });

      const refreshToken = profile.refreshToken;
      if (!refreshToken) {
        // Could occur on a re-consent where Google omits the refresh token.
        // Skip overwriting an existing valid credential; create one only if absent.
        const exists = await this.prisma.oAuthCredential.findUnique({
          where: { channelId: channel.id },
        });
        if (exists) continue;
        throw new YoutubeApiError('Google did not return a refresh token. Re-consent required.');
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
