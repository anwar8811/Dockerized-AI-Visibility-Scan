import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PROMPT_SCAN_QUEUE } from '@app/common';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';

@Module({
  imports: [BullModule.registerQueue({ name: PROMPT_SCAN_QUEUE })],
  controllers: [ScansController],
  providers: [ScansService],
  exports: [ScansService],
})
export class ScansModule {}
