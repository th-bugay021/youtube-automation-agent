import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { AiService } from './ai.service';

class GenerateIdeasDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;
}

class GenerateMetadataDto {
  @IsString()
  topic!: string;
}

@Controller('channels/:channelId/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('ideas')
  ideas(@Param('channelId') channelId: string, @Body() dto: GenerateIdeasDto) {
    return this.ai.generateIdeas(channelId, dto.count ?? 5);
  }

  @Post('metadata')
  metadata(@Param('channelId') channelId: string, @Body() dto: GenerateMetadataDto) {
    return this.ai.generateMetadata(channelId, dto.topic);
  }

  @Post('trends')
  trends(@Param('channelId') channelId: string) {
    return this.ai.generateTrends(channelId);
  }
}
