import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import {
  typeOrmDataSourceOptions,
  bullMqConnection,
  PROMPT_SCAN_QUEUE,
  Scan,
  Prompt,
} from '@app/common';
import { PromptScanProcessor } from './processors/prompt-scan.processor';
import { ProductsModule } from './products/products.module';
import { OpenRouterModule } from './ai/openrouter.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmDataSourceOptions),
    TypeOrmModule.forFeature([Scan, Prompt]),
    BullModule.forRoot({ connection: bullMqConnection }),
    BullModule.registerQueue({ name: PROMPT_SCAN_QUEUE }),
    ProductsModule,
    OpenRouterModule,
  ],
  providers: [PromptScanProcessor],
})
export class WorkerModule {}
