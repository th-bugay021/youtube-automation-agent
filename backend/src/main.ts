import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// JSON cannot serialize BigInt natively. Prisma returns BigInt for fields like
// Channel.viewCount and VideoMetric.views. We coerce to Number for transport —
// safe for YouTube counters (well under Number.MAX_SAFE_INTEGER ≈ 9×10^15).
// Switch to String if you ever expect counts beyond that.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(helmet());
  app.use(cookieParser(config.get<string>('COOKIE_SECRET') ?? config.get<string>('JWT_SECRET')));

  app.enableCors({
    origin: config.get<string>('FRONTEND_ORIGIN'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.setGlobalPrefix('api');

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  logger.log(`API ready on :${port}`);
}

bootstrap();
