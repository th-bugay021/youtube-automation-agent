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
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientID) throw new Error('GOOGLE_CLIENT_ID is not set');
    if (!clientSecret) throw new Error('GOOGLE_CLIENT_SECRET is not set');
    if (!callbackURL) throw new Error('GOOGLE_REDIRECT_URI is not set');

    // Guard against the most common cause of redirect_uri_mismatch in this app:
    // a localhost callback URL deployed to a non-localhost environment. The
    // value passed here is exactly what we send to Google as `redirect_uri`,
    // and Google rejects any value not whitelisted in the OAuth client.
    const nodeEnv = config.get<string>('NODE_ENV');
    if (nodeEnv === 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(callbackURL)) {
      throw new Error(
        `GOOGLE_REDIRECT_URI points at localhost in production: ${callbackURL}. ` +
          `Set it to the deployed callback, e.g. https://<api-host>/api/auth/google/callback.`,
      );
    }

    // eslint-disable-next-line no-console
    console.log('[GoogleStrategy] callbackURL =', callbackURL);

    super({
      clientID,
      clientSecret,
      callbackURL,
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
