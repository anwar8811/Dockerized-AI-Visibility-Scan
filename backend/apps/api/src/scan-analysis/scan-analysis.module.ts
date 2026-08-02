import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PROMPT_RANK_QUEUE } from '@app/common';
import { ScanAnalysisController } from './scan-analysis.controller';
import { ScanAnalysisService } from './scan-analysis.service';

@Module({
  imports: [BullModule.registerQueue({ name: PROMPT_RANK_QUEUE })],
  controllers: [ScanAnalysisController],
  providers: [ScanAnalysisService],
})
export class ScanAnalysisModule {}
