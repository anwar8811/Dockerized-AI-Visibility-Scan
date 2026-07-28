import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmDataSourceOptions } from '@app/common';

@Module({
  imports: [TypeOrmModule.forRoot(typeOrmDataSourceOptions)],
})
export class WorkerModule {}
