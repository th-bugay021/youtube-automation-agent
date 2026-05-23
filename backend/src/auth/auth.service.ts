import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuthError } from '../common/filters/all-exceptions.filter';

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Upsert the user record after Google OAuth and persist a per-channel OAuth
   * credential (encrypted) for the channels the consent covered.
   * The channel sync itself is performed by the ChannelsService — this method
   * returns the user payload only.
   */
  async upsertFromGoogle(profile: GoogleProfilePayload) {
    const user = await this.prisma.user.upsert({
      where: { googleId: profile.googleId },
      create: {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
      update: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
    return user;
  }

  async issueTokens(userId: string, email: string, role: string): Promise<IssuedTokens> {
    const access = await this.jwt.signAsync(
      { sub: userId, email, role },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
      },
    );

    const refreshRaw = randomBytes(48).toString('base64url');
    const refreshHash = await this.crypto.hashOpaque(refreshRaw);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: refreshHash, expiresAt },
    });

    return { accessToken: access, refreshToken: refreshRaw, expiresIn: 60 * 15 };
  }

  async rotateRefreshToken(rawToken: string): Promise<IssuedTokens> {
    const hash = await this.crypto.hashOpaque(rawToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new AuthError('Refresh token invalid');
    }
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(row.user.id, row.user.email, row.user.role);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
