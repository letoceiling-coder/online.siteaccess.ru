import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
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
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    
    const channel = await this.prisma.channel.findUnique({
      where: { tokenHash },
    });

    if (!channel) {
      throw new UnauthorizedException('Invalid token');
    }

    // Строгая проверка Origin
    const originHost = origin ? new URL(origin).hostname : null;
    const allowedDomains = channel.allowedDomains as string[] | null;
    
    if (allowedDomains && allowedDomains.length > 0) {
      if (!originHost || !allowedDomains.includes(originHost)) {
        throw new UnauthorizedException('Origin not allowed');
      }
    } else {
      // Production: если allowedDomains не заданы, разрешить только для localhost в dev
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Channel must have allowedDomains configured in production');
      }
      this.logger.warn(`Channel ${channel.id} has no allowedDomains - allowing all origins (dev mode)`);
    }

    // Обновить channel
    const updateData: any = {
      lastwidgetpingat: new Date(),
      lastwidgetpingurl: dto.pageUrl,
      lastwidgetpinguseragent: userAgent || null,
    };

    // Установить installVerifiedAt только если еще не установлен
    if (!(channel as any).installverifiedat) {
      updateData.installverifiedat = new Date();
    }

    await this.prisma.channel.update({
      where: { id: channel.id },
      data: updateData,
    });

    return { ok: true };
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
        senderId: true,
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
