import { Module } from '@nestjs/common';
import { PromptGenerationModule } from '../prompt-generation/prompt-generation.module';
import { ScanPromptsController } from './scan-prompts.controller';
import { ScanPromptsService } from './scan-prompts.service';

@Module({
  imports: [PromptGenerationModule],
  controllers: [ScanPromptsController],
  providers: [ScanPromptsService],
})
export class ScanPromptsModule {}
