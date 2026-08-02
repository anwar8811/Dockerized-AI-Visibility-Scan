import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import {
  typeOrmDataSourceOptions,
  bullMqConnection,
  PROMPT_SCAN_QUEUE,
  BRAND_INTELLIGENCE_QUEUE,
  Scan,
  Prompt,
  PromptResult,
  BrandProfile,
} from '@app/common';
import { PromptScanProcessor } from './processors/prompt-scan.processor';
import { BrandIntelligenceProcessor } from './processors/brand-intelligence.processor';
import { ProductsModule } from './products/products.module';
import { OpenRouterModule } from './ai/openrouter.module';
import { AnalyzerClientModule } from './analyzer/analyzer-client.module';
import { VisibilityScoringModule } from './scoring/visibility-scoring.module';
import { WebsiteCrawlerModule } from './crawler/website-crawler.module';
import { CompetitorLookupModule } from './competitor-lookup/competitor-lookup.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmDataSourceOptions),
    TypeOrmModule.forFeature([Scan, Prompt, PromptResult, BrandProfile]),
    BullModule.forRoot({ connection: bullMqConnection }),
    BullModule.registerQueue({ name: PROMPT_SCAN_QUEUE }),
    BullModule.registerQueue({ name: BRAND_INTELLIGENCE_QUEUE }),
    HttpModule,
    ProductsModule,
    OpenRouterModule,
    AnalyzerClientModule,
    VisibilityScoringModule,
    WebsiteCrawlerModule,
    CompetitorLookupModule,
  ],
  providers: [PromptScanProcessor, BrandIntelligenceProcessor],
})
export class WorkerModule {}
