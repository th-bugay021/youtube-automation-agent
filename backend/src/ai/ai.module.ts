import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { OpenAiService } from './openai.service';
import { AiController } from './ai.controller';

@Module({
  providers: [AiService, OpenAiService],
  controllers: [AiController],
  exports: [AiService, OpenAiService],
})
export class AiModule {}
