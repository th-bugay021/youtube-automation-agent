import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') ?? '',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
      callbackURL: config.get<string>('GOOGLE_REDIRECT_URI') ?? '',
      scope: YOUTUBE_SCOPES,
      accessType: 'offline',
      prompt: 'consent',
    });
  }

  /**
   * passport-google-oauth20 reads OAuth params from this method on every
   * authorization request. The constructor's `accessType` / `prompt` options
   * only apply when those settings are also forwarded via this hook, so we
   * make them unconditional here.
   *
   * - `access_type=offline`  → Google issues a refresh token alongside the access token.
   * - `prompt=consent`       → forces the consent screen every time, which is what
   *                            actually causes Google to RE-emit the refresh token on
   *                            re-auth. Without this, returning users get the access
   *                            token but no refresh token.
   * - `include_granted_scopes=true` → keeps any previously granted scopes.
   */
  authorizationParams(): Record<string, string> {
    return {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    };
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    // Diagnostic — remove once OAuth flow is stable
    // Intentionally does not log token values, only presence + length.
    console.log('[GoogleStrategy.validate]', {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length ?? 0,
      hasRefreshToken: !!refreshToken,
      refreshTokenLength: refreshToken?.length ?? 0,
      profileId: profile?.id,
      email: profile?.emails?.[0]?.value,
    });

    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('Google account has no email'), false);

    const payload = {
      googleId: profile.id,
      email,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      accessToken,
      refreshToken,
      expiresIn: 3600,
      scope: YOUTUBE_SCOPES.join(' '),
    };
    done(null, payload as any);
  }
}
