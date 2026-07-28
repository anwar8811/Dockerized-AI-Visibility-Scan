import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Validates every incoming request body against its DTO's class-validator
  // decorators (e.g. CreateScanDto) before it ever reaches a controller
  // method - an invalid body never touches the database or the queue.
  // The exact 400 response *shape* is standardized later, in STORY-008's
  // global exception filter; this only needs the validation behavior itself
  // to be correct.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
