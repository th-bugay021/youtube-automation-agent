import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';
import { AuthService, GoogleProfilePayload } from './auth.service';
import { GoogleAuthGuard } from './strategies/google-auth.guard';
import { JwtAuthGuard } from './strategies/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ChannelsService } from '../channels/channels.service';
import { AuthError } from '../common/filters/all-exceptions.filter';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly channels: ChannelsService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  google(): void {
    // Passport handles the redirect to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as unknown as GoogleProfilePayload;
    const user = await this.auth.upsertFromGoogle(profile);

    // Sync linked channels using the freshly issued Google tokens. Channel
    // sync is best-effort — never let a YouTube/Prisma hiccup block login.
    // The service itself swallows recoverable errors; this guards against
    // anything unexpected so the user always lands on the dashboard.
    try {
      await this.channels.syncFromGoogleAuth(user.id, profile);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AuthController.googleCallback] channel sync failed (non-fatal)', err);
    }

    const tokens = await this.auth.issueTokens(user.id, user.email, user.role);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    const frontend = this.config.get<string>('FRONTEND_ORIGIN');
    res.redirect(`${frontend}/dashboard?auth=google&sync=channels`);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const raw = req.cookies?.['refresh_token'];
    if (!raw) throw new AuthError('No refresh token');
    const tokens = await this.auth.rotateRefreshToken(raw);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ ok: true, expiresIn: tokens.expiresIn });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    await this.auth.revokeAllForUser(user.id);
    this.clearAuthCookies(res);
    res.json({ ok: true });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  private setAuthCookies(res: Response, access: string, refresh: string): void {
    res.cookie('access_token', access, this.authCookieOptions(15 * 60 * 1000));
    res.cookie('refresh_token', refresh, this.authCookieOptions(7 * 24 * 60 * 60 * 1000));
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', this.authCookieOptions());
    res.clearCookie('refresh_token', this.authCookieOptions());
  }

  private authCookieOptions(maxAge?: number): CookieOptions {
    const secure = this.cookieSecure();
    const domain = this.cookieDomain();
    return {
      httpOnly: true,
      sameSite: this.cookieSameSite(secure),
      secure,
      ...(domain ? { domain } : {}),
      ...(maxAge ? { maxAge } : {}),
      path: '/',
    };
  }

  private cookieSecure(): boolean {
    const configured = this.config.get<string>('COOKIE_SECURE')?.toLowerCase();
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    if (configured === 'true') return true;
    // SameSite=None cookies are ignored by browsers unless they are Secure.
    if (configured === 'false') return isProduction;
    return isProduction;
  }

  private cookieSameSite(secure: boolean): CookieOptions['sameSite'] {
    const configured = this.config.get<string>('COOKIE_SAME_SITE')?.toLowerCase();
    if (configured === 'lax' || configured === 'strict') return configured;
    if (configured === 'none') return secure ? 'none' : 'lax';

    const frontend = this.config.get<string>('FRONTEND_ORIGIN');
    const callback = this.config.get<string>('GOOGLE_REDIRECT_URI');
    const crossOrigin = this.urlHost(frontend) !== this.urlHost(callback);
    return secure && crossOrigin ? 'none' : 'lax';
  }

  private cookieDomain(): string | undefined {
    const raw = this.config.get<string>('COOKIE_DOMAIN')?.trim();
    if (!raw) return undefined;

    const normalized = raw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();

    if (!normalized || normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') {
      return undefined;
    }

    return normalized;
  }

  private urlHost(value?: string): string | undefined {
    if (!value) return undefined;
    try {
      return new URL(value).host;
    } catch {
      return undefined;
    }
  }
}
