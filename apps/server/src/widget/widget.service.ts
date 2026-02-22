import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { WidgetSessionDto } from './dto/widget-session.dto';
import { WidgetPingDto } from './dto/widget-ping.dto';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WidgetService {
  private readonly logger = new Logger(WidgetService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async createSession(dto: WidgetSessionDto, origin?: string) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    
    const channel = await this.prisma.channel.findUnique({
      where: { tokenHash },
    });

    if (!channel) {
      // Log invalid token attempt (first 8 chars only, no secrets)
      const tokenPreview = dto.token ? dto.token.substring(0, 8) + '...' : 'empty';
      this.logger.warn(`Invalid token attempt: ${tokenPreview}, origin: ${origin || 'unknown'}`);
      throw new UnauthorizedException('Invalid token');
    }

    // Проверка Origin (domain lock)
    const originHost = origin ? new URL(origin).hostname : null;
    const allowedDomains = channel.allowedDomains as string[] | null;
    const channelIdPrefix = channel.id.substring(0, 8);
    
    if (allowedDomains && allowedDomains.length > 0) {
      if (!originHost || !allowedDomains.includes(originHost)) {
        this.logger.warn(`[DOMAIN_LOCK] Channel ${channelIdPrefix}... denied: origin=${originHost || 'missing'}, allowed=${allowedDomains.join(',')}`);
        throw new ForbiddenException('DOMAIN_NOT_ALLOWED');
      }
      this.logger.log(`[DOMAIN_LOCK] Channel ${channelIdPrefix}... allowed: origin=${originHost}`);
    } else {
      // Dev mode: разрешить все, но предупредить
      this.logger.warn(`[DOMAIN_LOCK] Channel ${channelIdPrefix}... has no allowedDomains - allowing all origins (dev mode)`);
    }

    // Создать/обновить Visitor
    let externalId = dto.externalId;
    if (!externalId) {
      externalId = uuidv4();
    }

    const visitor = await this.prisma.visitor.upsert({
      where: { externalId },
      update: { lastSeenAt: new Date() },
      create: {
        channelId: channel.id,
        externalId,
        lastSeenAt: new Date(),
      },
    });

    // Найти или создать открытую Conversation
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        channelId: channel.id,
        visitorId: visitor.id,
        status: 'open',
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          channelId: channel.id,
          visitorId: visitor.id,
          status: 'open',
        },
      });
    }

    // Создать JWT токен
    const payload = {
      channelId: channel.id,
      visitorId: visitor.id,
      conversationId: conversation.id,
    };

    const visitorSessionToken = this.jwtService.sign(payload);

    return {
      externalId: visitor.externalId,
      conversationId: conversation.id,
      visitorSessionToken,
    };
  }

  async ping(dto: WidgetPingDto, origin?: string, userAgent?: string) {
    // Validate input
    if (!dto.token || dto.token.trim().length === 0) {
      throw new BadRequestException('Token is required');
    }

    const tokenPreview = dto.token ? dto.token.substring(0, 8) + '...' : 'empty';
    let originHost: string | null = null;

    try {
      if (origin) {
        originHost = new URL(origin).hostname;
      }
    } catch (e) {
      // Invalid origin URL - log but continue (will be checked against allowedDomains)
      this.logger.warn(`[PING] Invalid origin URL: ${origin}`);
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
      
      const channel = await this.prisma.channel.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          allowedDomains: true,
          installverifiedat: true,
          lastWidgetPingAt: true,
          lastWidgetPingUrl: true,
          lastWidgetPingUserAgent: true,
        },
      });

      if (!channel) {
        this.logger.warn(`[PING] Invalid token: ${tokenPreview}, origin: ${originHost || 'missing'}`);
        throw new UnauthorizedException('Invalid token');
      }

      const channelIdPrefix = channel.id.substring(0, 8);

      // Строгая проверка Origin
      const allowedDomains = channel.allowedDomains as string[] | null;
      
      if (allowedDomains && allowedDomains.length > 0) {
        if (!originHost || !allowedDomains.includes(originHost)) {
          this.logger.warn(`[PING] [DOMAIN_LOCK] Channel ${channelIdPrefix}... denied: origin=${originHost || 'missing'}, allowed=${allowedDomains.join(',')}`);
          throw new ForbiddenException('DOMAIN_NOT_ALLOWED');
        }
        this.logger.log(`[PING] [DOMAIN_LOCK] Channel ${channelIdPrefix}... allowed: origin=${originHost}`);
      } else {
        // Production: если allowedDomains не заданы, разрешить только для localhost в dev
        if (process.env.NODE_ENV === 'production') {
          this.logger.warn(`[PING] Channel ${channelIdPrefix}... has no allowedDomains in production`);
          throw new ForbiddenException('Channel must have allowedDomains configured in production');
        }
        this.logger.warn(`[PING] Channel ${channelIdPrefix}... has no allowedDomains - allowing all origins (dev mode)`);
      }

      // Обновить channel (используем правильные имена полей Prisma - camelCase)
      const updateData: any = {
        lastWidgetPingAt: new Date(),
        lastWidgetPingUrl: dto.pageUrl || null,
        lastWidgetPingUserAgent: userAgent || null,
      };

      // Установить installverifiedat только если еще не установлен
      // Note: Prisma returns fields in camelCase from schema, not DB column names
      if (!(channel as any).installverifiedat) {
        updateData.installverifiedat = new Date();
      }

      await this.prisma.channel.update({
        where: { id: channel.id },
        data: updateData,
      });

      this.logger.log(`[PING] Channel ${channelIdPrefix}... updated successfully`);
      return null; // Return null for 204 No Content
    } catch (error: any) {
      // Log detailed error for debugging (without secrets)
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        // User errors - rethrow as-is
        throw error;
      }

      // Prisma errors - log details
      if (error.code && error.meta) {
        this.logger.error(
          `[PING] Prisma error: code=${error.code}, message=${error.message}, token=${tokenPreview}, origin=${originHost || 'missing'}`,
          error.stack
        );
      } else {
        this.logger.error(
          `[PING] Unexpected error: ${error.message || 'unknown'}, token=${tokenPreview}, origin=${originHost || 'missing'}`,
          error.stack
        );
      }

      // Re-throw as 500 for unexpected errors
      throw error;
    }
  }

  async getMessages(conversationId: string, visitorSessionToken: string, limit: number = 50) {
    if (!visitorSessionToken) {
      throw new UnauthorizedException('Missing visitorSessionToken');
    }

    // Verify token and extract conversationId
    let payload: any;
    try {
      payload = this.jwtService.verify(visitorSessionToken, {
        secret: process.env.JWT_SECRET || 'dev-secret',
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid visitorSessionToken');
    }

    // Verify conversationId matches token
    if (payload.conversationId !== conversationId) {
      throw new UnauthorizedException('Conversation ID mismatch');
    }

    // Fetch messages
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        conversationId: true,
        senderType: true,
        
        text: true,
        createdAt: true,
        clientMessageId: true,
      },
    });

    return messages.map((msg) => ({
      serverMessageId: msg.id,
      conversationId: msg.conversationId,
      text: msg.text,
      senderType: msg.senderType,
      createdAt: msg.createdAt.toISOString(),
      clientMessageId: msg.clientMessageId,
    }));
  }
}
