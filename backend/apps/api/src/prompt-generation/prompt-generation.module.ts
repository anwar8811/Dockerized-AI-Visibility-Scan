import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PromptGeneratorService } from './prompt-generator.service';

@Module({
  imports: [HttpModule],
  providers: [PromptGeneratorService],
  exports: [PromptGeneratorService],
})
export class PromptGenerationModule {}
