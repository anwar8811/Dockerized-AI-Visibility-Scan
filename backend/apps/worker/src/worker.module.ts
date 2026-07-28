import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';

@Module({
  imports: [CommonModule],
})
export class WorkerModule {}
