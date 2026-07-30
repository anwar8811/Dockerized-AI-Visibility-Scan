import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { typeOrmDataSourceOptions, apiBullMqConnection } from '@app/common';
import { HealthModule } from './health/health.module';
import { ScansModule } from './scans/scans.module';
import { AutoScansModule } from './auto-scans/auto-scans.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmDataSourceOptions),
    BullModule.forRoot({ connection: apiBullMqConnection }),
    HealthModule,
    ScansModule,
    AutoScansModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
