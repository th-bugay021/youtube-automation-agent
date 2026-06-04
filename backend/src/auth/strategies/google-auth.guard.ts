import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { RedirectError } from '../../common/filters/all-exceptions.filter';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return (await super.canActivate(context)) as boolean;
    } catch (err) {
      const req = context.switchToHttp().getRequest<Request>();
      if (!this.isCallback(req)) throw err;

      const reason = this.failureReason(err);

      // eslint-disable-next-line no-console
      console.warn('[GoogleAuthGuard] OAuth callback exchange failed', { reason });

      throw new RedirectError(this.loginUrl(reason));
    }
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const req = context.switchToHttp().getRequest<Request>();

      if (this.isCallback(req)) {
        const reason = this.failureReason(err ?? info);

        // Do not expose raw provider errors or callback query params. OAuth
        // codes are one-time secrets and often fail after refresh/reuse.
        // eslint-disable-next-line no-console
        console.warn('[GoogleAuthGuard] OAuth callback failed', { reason });

        throw new RedirectError(this.loginUrl(reason));
      }

      throw err ?? new UnauthorizedException();
    }

    return user;
  }

  private isCallback(req: Request): boolean {
    const url = req.originalUrl ?? req.url ?? '';
    return url.includes('/auth/google/callback');
  }

  private loginUrl(reason: string): string {
    const frontend = this.config.get<string>('FRONTEND_ORIGIN')?.replace(/\/$/, '') ?? '';
    const params = new URLSearchParams({ error: 'google_oauth', reason });
    return `${frontend}/login?${params.toString()}`;
  }

  private failureReason(value: unknown): string {
    if (!value || typeof value !== 'object') return 'failed';

    const source = value as { code?: unknown; message?: unknown; oauthError?: unknown };
    const raw = source.code ?? source.oauthError ?? source.message ?? 'failed';
    return String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'failed';
  }
}
