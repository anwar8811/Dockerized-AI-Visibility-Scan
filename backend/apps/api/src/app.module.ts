import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [CommonModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
