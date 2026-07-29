import { Module } from '@nestjs/common';
import { VisibilityScoringService } from './visibility-scoring.service';

@Module({
  providers: [VisibilityScoringService],
  exports: [VisibilityScoringService],
})
export class VisibilityScoringModule {}
