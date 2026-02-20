import { Controller, Post, Body, Headers } from '@nestjs/common';
import { WidgetService } from './widget.service';
import { WidgetSessionDto } from './dto/widget-session.dto';
import { WidgetPingDto } from './dto/widget-ping.dto';

@Controller('api/widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Post('session')
  async createSession(
    @Body() dto: WidgetSessionDto,
    @Headers('origin') origin?: string,
  ) {
    return this.widgetService.createSession(dto, origin);
  }

  @Post('ping')
  async ping(
    @Body() dto: WidgetPingDto,
    @Headers('origin') origin?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.widgetService.ping(dto, origin, userAgent);
  }
}
