import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, headers } = req;
    const origin = headers.origin || headers.host || 'unknown';
    
    this.logger.log(`${method} ${originalUrl} - Origin: ${origin}`);
    next();
  }
}
