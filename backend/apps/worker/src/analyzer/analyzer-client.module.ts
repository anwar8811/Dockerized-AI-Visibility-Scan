import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AnalyzerClientService } from './analyzer-client.service';

@Module({
  imports: [HttpModule],
  providers: [AnalyzerClientService],
  exports: [AnalyzerClientService],
})
export class AnalyzerClientModule {}
