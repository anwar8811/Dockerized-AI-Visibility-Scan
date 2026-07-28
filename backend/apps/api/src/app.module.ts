import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmDataSourceOptions } from '@app/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [TypeOrmModule.forRoot(typeOrmDataSourceOptions), HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
