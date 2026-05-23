import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Worker entrypoint. Boots the same Nest application but does NOT call listen().
 * BullMQ workers attached via @Processor() decorators start automatically when
 * the module is instantiated, so all we need is a created (not listening) app.
 *
 * Run with: npm run start:worker
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  logger.log('Worker ready');

  const shutdown = async (signal: string) => {
    logger.log(`Worker received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap();
