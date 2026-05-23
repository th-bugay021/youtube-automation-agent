import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.analytics.dashboardSummary(user.id);
  }

  @Get('channel/:channelId')
  channel(@Param('channelId') channelId: string, @Query('days') days?: string) {
    return this.analytics.channelTimeseries(channelId, days ? Number(days) : 30);
  }
}
