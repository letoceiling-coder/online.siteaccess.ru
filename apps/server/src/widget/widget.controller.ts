import { Controller, Post, Get, Body, Headers, Query, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WidgetService } from './widget.service';
import { WidgetSessionDto } from './dto/widget-session.dto';
import { WidgetPingDto } from './dto/widget-ping.dto';
import { Request } from 'express';

@Controller('api/widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Post('session')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  async createSession(
    @Body() dto: WidgetSessionDto,
    @Headers('origin') origin?: string,
    @Headers('referer') referer?: string,
    @Req() req?: Request,
  ) {
    // Extract origin from Origin header, or fallback to Referer
    const originHeader = origin || referer || req?.headers?.origin || req?.headers?.referer;
    return this.widgetService.createSession(dto, originHeader);
  }
  
  @Get('messages')
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 requests per minute
  async getMessages(
    @Query('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = authHeader?.replace('Bearer ', '') || authHeader;
    return this.widgetService.getMessages(conversationId, token, limit ? parseInt(limit, 10) : 50);
  }

  @Post('ping')
  @HttpCode(HttpStatus.NO_CONTENT) // 204 No Content
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 requests per minute
  async ping(
    @Body() dto: WidgetPingDto,
    @Headers('origin') origin?: string,
    @Headers('referer') referer?: string,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: Request,
  ) {
    // Extract origin from Origin header, or fallback to Referer
    const originHeader = origin || referer || req?.headers?.origin || req?.headers?.referer;
    await this.widgetService.ping(dto, originHeader, userAgent);
    // 204 No Content - no body returned
  }
}
