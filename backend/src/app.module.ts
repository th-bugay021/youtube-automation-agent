import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';

import { configValidationSchema } from './config/validation';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChannelsModule } from './channels/channels.module';
import { YoutubeModule } from './youtube/youtube.module';
import { VideosModule } from './videos/videos.module';
import { AiModule } from './ai/ai.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { QueueModule } from './queue/queue.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StudioModule } from './studio/studio.module';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.accessToken',
          '*.refreshToken',
          '*.accessTokenCipher',
          '*.refreshTokenCipher',
          '*.password',
          '*.passwordHash',
        ],
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
    ScheduleModule.forRoot(),

    PrismaModule,
    CryptoModule,
    AuthModule,
    UsersModule,
    ChannelsModule,
    YoutubeModule,
    VideosModule,
    AiModule,
    SchedulingModule,
    QueueModule,
    AnalyticsModule,
    NotificationsModule,
    StudioModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
  ],
})
export class AppModule {}
