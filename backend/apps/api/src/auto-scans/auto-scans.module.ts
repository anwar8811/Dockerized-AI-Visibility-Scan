import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BRAND_INTELLIGENCE_QUEUE } from '@app/common';
import { AutoScansController } from './auto-scans.controller';
import { AutoScansService } from './auto-scans.service';

@Module({
  imports: [BullModule.registerQueue({ name: BRAND_INTELLIGENCE_QUEUE })],
  controllers: [AutoScansController],
  providers: [AutoScansService],
})
export class AutoScansModule {}
