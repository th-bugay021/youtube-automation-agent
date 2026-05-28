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
import { Request, Response } from 'express';
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
    res.redirect(`${frontend}/dashboard`);
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
    const secure = (this.config.get<string>('COOKIE_SECURE') ?? 'false') === 'true';
    const domain = this.config.get<string>('COOKIE_DOMAIN');
    res.cookie('access_token', access, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      domain,
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    res.cookie('refresh_token', refresh, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      domain,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }
}
