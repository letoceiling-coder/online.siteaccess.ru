import { Controller, Get, Headers, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('api/_smoke')
export class SmokeController {
  constructor(private config: ConfigService) {}

  @Get('throttle')
  throttle(@Headers('x-smoke-key') smokeKey: string) {
    const smokeEnabled = this.config.get('SMOKE_ENABLED') === 'true';
    const expectedKey = this.config.get('SMOKE_KEY');

    if (!smokeEnabled) {
      throw new NotFoundException();
    }

    if (!expectedKey || smokeKey !== expectedKey) {
      throw new NotFoundException();
    }

    return {
      ok: true,
      message: 'Throttle smoke endpoint',
      timestamp: new Date().toISOString(),
    };
  }
}
