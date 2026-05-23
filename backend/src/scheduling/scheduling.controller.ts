import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { SchedulingService } from './scheduling.service';

@Controller('channels/:channelId/scheduling')
@UseGuards(JwtAuthGuard)
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('best-time')
  bestTime(@Param('channelId') channelId: string) {
    return this.scheduling.suggestBestTime(channelId);
  }
}
