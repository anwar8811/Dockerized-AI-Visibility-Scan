import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WebsiteCrawlerModule } from '../crawler/website-crawler.module';
import { CompetitorLookupService } from './competitor-lookup.service';

@Module({
  imports: [HttpModule, WebsiteCrawlerModule],
  providers: [CompetitorLookupService],
  exports: [CompetitorLookupService],
})
export class CompetitorLookupModule {}
