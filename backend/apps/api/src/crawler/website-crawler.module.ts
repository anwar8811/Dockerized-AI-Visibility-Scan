import { Module } from '@nestjs/common';
import { WebsiteCrawlerService } from './website-crawler.service';

@Module({
  providers: [WebsiteCrawlerService],
  exports: [WebsiteCrawlerService],
})
export class WebsiteCrawlerModule {}
