import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
  }
}

export class YoutubeApiError extends DomainError {
  constructor(message: string, public readonly youtubeReason?: string) {
    super('YOUTUBE_API_ERROR', message, 502);
  }
}

export class OpenAiQuotaError extends DomainError {
  constructor(message = 'AI quota exhausted') {
    super('OPENAI_QUOTA', message, 429);
  }
}

export class AuthError extends DomainError {
  constructor(message = 'Unauthorized') {
    super('AUTH', message, 401);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof DomainError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') {
        message = r;
      } else if (typeof r === 'object' && r !== null) {
        const obj = r as Record<string, unknown>;
        message = (obj.message as string) ?? exception.message;
        details = obj.errors ?? obj.details;
        code = (obj.code as string) ?? exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const requestId = (req as any).id ?? req.headers['x-request-id'];

    if (status >= 500) {
      this.logger.error({ err: exception, requestId, path: req.url }, 'Unhandled error');
    } else {
      this.logger.warn({ code, status, requestId, path: req.url }, message);
    }

    res.status(status).json({
      error: { code, message, details, requestId },
    });
  }
}
