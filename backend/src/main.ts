import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Apply any pending Prisma migrations before the API serves traffic.
 *
 * Render's free tier has no pre-deploy hook, so instead of a separate
 * `prisma migrate deploy` step we run it here at boot. It is idempotent
 * (already-applied migrations are skipped) and guarded by a Postgres advisory
 * lock, so it is safe even if more than one instance starts at once.
 *
 * Only the API process (this file) runs migrations — the worker boots via
 * `createApplicationContext` and deliberately stays out of it, so the two never
 * race on the same database.
 *
 * If a migration fails we let it throw: bootstrap()'s catch exits non-zero and
 * Render restarts the deploy, which is better than serving requests against a
 * schema that is missing columns.
 *
 * Set MIGRATE_ON_STARTUP=false to skip (e.g. local dev that manages its own
 * schema with `prisma migrate dev`).
 */
function runMigrations(logger: Logger) {
  if (process.env.MIGRATE_ON_STARTUP === 'false') {
    logger.log('Skipping startup migrations (MIGRATE_ON_STARTUP=false)');
    return;
  }
  // Invoke the Prisma CLI via the current Node binary rather than the
  // node_modules/.bin shim, so it works the same on Linux (Render) and Windows
  // without a shell. __dirname is dist/, so the schema sits one level up.
  const cli = require.resolve('prisma/build/index.js');
  const schema = join(__dirname, '..', 'prisma', 'schema.prisma');
  logger.log('Applying database migrations (prisma migrate deploy)…');
  execFileSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
    stdio: 'inherit',
  });
  logger.log('Database migrations up to date');
}

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

  // Bring the database schema up to date before accepting any requests.
  runMigrations(logger);

  app.use(helmet());
  app.use(cookieParser(config.get<string>('COOKIE_SECRET') ?? config.get<string>('JWT_SECRET')));

  // The browser's Origin header never has a trailing slash. If FRONTEND_ORIGIN
  // is configured with one, the CORS check fails to match and the response
  // carries no Access-Control-Allow-Origin — silently blocking every
  // credentialed cross-site request from the Vercel frontend.
  const frontendOrigin = config.get<string>('FRONTEND_ORIGIN')?.replace(/\/$/, '');
  app.enableCors({
    origin: frontendOrigin,
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

  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT')) || 4000;
  await app.listen(port, '0.0.0.0');
  logger.log(`API ready on :${port}`);
}

bootstrap().catch((err) => {
  // bufferLogs swallows NestFactory errors before useLogger is called,
  // so write directly to stderr to make Render's runtime log useful.
  // eslint-disable-next-line no-console
  console.error('Fatal: failed to start application', err);
  process.exit(1);
});
