import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from '@app/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validates every incoming request body against its DTO's class-validator
  // decorators (e.g. CreateScanDto) before it ever reaches a controller
  // method - an invalid body never touches the database or the queue.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // The single mechanism every route's error response goes through -
  // {statusCode, message, error}, every time, whether it's a validation
  // failure, a 404, or a genuinely unexpected error (KAD-10).
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Visibility Scan Pipeline API')
    .setDescription(
      'Submit a brand + competitors + AI search prompts, then poll the scan for its computed Visibility Score.',
    )
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
