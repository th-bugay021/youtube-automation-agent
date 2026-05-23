import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VideoStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { VideosService } from './videos.service';
import { ApproveVideoDto, CreateVideoDto, UpdateVideoDto } from './dto/video.dto';

@Controller('videos')
@UseGuards(JwtAuthGuard)
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVideoDto) {
    return this.videos.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateVideoDto) {
    return this.videos.update(user.id, id, dto);
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveVideoDto,
  ) {
    return this.videos.approve(user.id, id, dto);
  }

  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.videos.cancel(user.id, id);
  }

  @Get('queue')
  queue(@CurrentUser() user: AuthUser) {
    return this.videos.listQueue(user.id);
  }

  @Get('by-channel/:channelId')
  byChannel(
    @CurrentUser() user: AuthUser,
    @Param('channelId') channelId: string,
    @Query('status') status?: VideoStatus,
  ) {
    return this.videos.listForChannel(user.id, channelId, status);
  }
}
