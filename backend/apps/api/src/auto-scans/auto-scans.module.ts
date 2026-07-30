import { Module } from '@nestjs/common';
import { WebsiteCrawlerModule } from '../crawler/website-crawler.module';
import { PromptGenerationModule } from '../prompt-generation/prompt-generation.module';
import { ScansModule } from '../scans/scans.module';
import { AutoScansController } from './auto-scans.controller';
import { AutoScansService } from './auto-scans.service';

@Module({
  imports: [WebsiteCrawlerModule, PromptGenerationModule, ScansModule],
  controllers: [AutoScansController],
  providers: [AutoScansService],
})
export class AutoScansModule {}
