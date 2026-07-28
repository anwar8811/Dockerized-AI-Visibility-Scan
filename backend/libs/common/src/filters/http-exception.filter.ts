import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ShapedErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

// @Catch() with no argument means this catches EVERYTHING thrown anywhere
// in the app - not just recognized HttpExceptions (400s, 404s, etc.) but
// also a genuinely unexpected error (e.g. a database driver failure).
// Every response this filter produces has the exact same shape, so no
// controller ever needs its own try/catch -> res.json(...) logic (KAD-10).
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const shaped: ShapedErrorBody =
        typeof body === 'string'
          ? { statusCode: status, message: body, error: exception.name }
          : {
              statusCode: status,
              message: (body as Record<string, unknown>).message as string,
              error: (body as Record<string, unknown>).error as string,
            };
      response.status(status).json(shaped);
      return;
    }

    // Anything reaching here is NOT a recognized HttpException - this is
    // unexpected. Log the real cause server-side (stack trace included)
    // but never send those details to the client; the client only ever
    // gets a generic message in the same shape as every other error.
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    const shaped: ShapedErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(shaped);
  }
}
