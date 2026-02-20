import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception instanceof Error
        ? exception.message
        : 'Internal server error';

    // Log full error details (never log passwords/tokens)
    const errorDetails = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: exception instanceof Error ? exception.name : 'Unknown',
      message: typeof message === 'string' ? message : (message as any).message || message,
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    // Remove sensitive data from logs
    if (request.body) {
      const safeBody = { ...request.body };
      if (safeBody.password) safeBody.password = '***';
      if (safeBody.token) safeBody.token = '***';
      if (safeBody.accessToken) safeBody.accessToken = '***';
      errorDetails['body'] = safeBody;
    }

    this.logger.error(
      `Exception: ${errorDetails.method} ${errorDetails.path} -> ${errorDetails.statusCode}`,
      JSON.stringify(errorDetails, null, 2),
    );

    // Send safe error response
    response.status(status).json({
      statusCode: status,
      timestamp: errorDetails.timestamp,
      path: request.url,
      message: typeof message === 'string' ? message : (message as any).message || 'Internal server error',
    });
  }
}
