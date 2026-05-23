import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuthError, YoutubeApiError } from '../common/filters/all-exceptions.filter';

export interface AuthorizedYoutube {
  youtube: youtube_v3.Youtube;
  oauth: OAuth2Client;
  channelId: string;
}

/**
 * Constructs a YouTube Data API v3 client authorised for a specific channel.
 * Decrypts the stored refresh token, attaches it to a fresh OAuth2 client, and
 * triggers an opportunistic refresh whenever the access token is within 60s of
 * expiry. Refreshed tokens are re-encrypted and persisted.
 */
@Injectable()
export class YoutubeClientFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async forChannel(channelId: string): Promise<AuthorizedYoutube> {
    const credential = await this.prisma.oAuthCredential.findUnique({
      where: { channelId },
    });
    if (!credential) {
      throw new AuthError('No OAuth credential for channel');
    }

    const oauth = new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_REDIRECT_URI'),
    );

    const accessToken = this.crypto.decrypt(credential.accessTokenCipher);
    const refreshToken = this.crypto.decrypt(credential.refreshTokenCipher);

    oauth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: credential.expiresAt.getTime(),
      token_type: credential.tokenType,
      scope: credential.scope,
    });

    const aboutToExpire = credential.expiresAt.getTime() - Date.now() < 60_000;
    if (aboutToExpire) {
      try {
        const { credentials } = await oauth.refreshAccessToken();
        await this.persistRefreshed(channelId, credentials);
        oauth.setCredentials(credentials);
      } catch (err) {
        throw new YoutubeApiError('Failed to refresh OAuth token', (err as Error).message);
      }
    }

    oauth.on('tokens', async (tokens) => {
      try {
        await this.persistRefreshed(channelId, tokens);
      } catch {
        // swallow — caller already has the live tokens
      }
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth });
    return { youtube, oauth, channelId };
  }

  private async persistRefreshed(
    channelId: string,
    creds: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
  ): Promise<void> {
    if (!creds.access_token) return;
    const data: Record<string, unknown> = {
      accessTokenCipher: this.crypto.encrypt(creds.access_token),
      expiresAt: new Date(creds.expiry_date ?? Date.now() + 3600_000),
    };
    if (creds.refresh_token) {
      data.refreshTokenCipher = this.crypto.encrypt(creds.refresh_token);
    }
    await this.prisma.oAuthCredential.update({
      where: { channelId },
      data,
    });
  }
}
