import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Normalizes every unhandled error into a safe response shape.
 * Never leaks stack traces, database errors, or internal details to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as Record<string, unknown>).message ?? exception.message);
      response.status(status).json({
        error: {
          code: HttpStatus[status] ?? 'ERROR',
          message: Array.isArray(message) ? message.join('; ') : String(message),
        },
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
  }
}
