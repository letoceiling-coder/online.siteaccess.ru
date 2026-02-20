import { Controller, Post, Body, Headers, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WidgetService } from './widget.service';
import { WidgetSessionDto } from './dto/widget-session.dto';
import { WidgetPingDto } from './dto/widget-ping.dto';

@Controller('api/widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Post('session')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  async createSession(
    @Body() dto: WidgetSessionDto,
    @Headers('origin') origin?: string,
  ) {
    return this.widgetService.createSession(dto, origin);
  }

  @Post('ping')
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 requests per minute
  async ping(
    @Body() dto: WidgetPingDto,
    @Headers('origin') origin?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.widgetService.ping(dto, origin, userAgent);
  }
}
