import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ChannelsService } from './channels.service';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.channels.listForUser(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.channels.getOwned(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channels.update(user.id, id, dto);
  }

  @Delete(':id')
  disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.channels.disconnect(user.id, id);
  }
}
