import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProductsModule } from '../products/products.module';
import { OpenRouterService } from './openrouter.service';

@Module({
  imports: [HttpModule, ProductsModule],
  providers: [OpenRouterService],
  exports: [OpenRouterService],
})
export class OpenRouterModule {}
