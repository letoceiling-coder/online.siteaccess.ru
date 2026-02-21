import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UseGuards, UsePipes, ValidationPipe, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { WidgetAuthGuard } from '../middleware/widget-auth.middleware';

@WebSocketGateway({
  namespace: '/widget',
  cors: { origin: true, credentials: true },
})
@UseGuards(WidgetAuthGuard)
@UsePipes(new ValidationPipe())
@Injectable()
export class WidgetGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WidgetGateway.name);
  private presenceCache: Map<string, { count: number; expires: number }> = new Map();

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private redis: Redis,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    // Guard applies to messages, not connection - need to auth here
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    
    this.logger.log(`[TRACE] handleConnection: clientId=${client.id}, hasToken=${!!token}, authKeys=[${Object.keys(client.handshake.auth || {}).join(',')}], queryKeys=[${Object.keys(client.handshake.query || {}).join(',')}]`);
    
    if (!token || typeof token !== 'string') {
      this.logger.warn(`Widget connection rejected: no token, clientId=${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET') || 'dev-secret',
      });
      
      this.logger.log(`[TRACE] Token verified: channelId=${payload.channelId}, conversationId=${payload.conversationId}`);
      
      client.data.channelId = payload.channelId;
      client.data.visitorId = payload.visitorId;
      client.data.conversationId = payload.conversationId;
      client.data.externalId = payload.externalId;

      client.join(`channel:${payload.channelId}`);
      client.join(`conversation:${payload.conversationId}`);

      this.logger.log(`Widget connected: ${client.id}, channel: ${payload.channelId}, conversation: ${payload.conversationId}`);
    } catch (error) {
      this.logger.warn(`Widget connection rejected: invalid token, clientId=${client.id}, error=${error instanceof Error ? error.message : 'unknown'}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Widget disconnected: ${client.id}`);
  }

  @SubscribeMessage('message:send')
  async handleMessage(client: Socket, payload: { conversationId: string; text: string; clientMessageId: string }) {
    this.logger.log(`message:send received from ${client.id}, payload: ${JSON.stringify(payload)}`);
    const { conversationId: socketConvId, visitorId } = client.data;
    const { conversationId, text, clientMessageId } = payload;

    // Проверка conversationId
    if (conversationId !== socketConvId) {
      client.emit('error', { message: 'Invalid conversationId' });
      return;
    }

    // Валидация
    if (!text || text.trim().length === 0 || text.length > 4000) {
      client.emit('error', { message: 'Invalid text: must be 1-4000 chars' });
      return;
    }

    // Проверка дубликата (skip if clientMessageId column doesn't exist in DB)
    let existing = null;
    try {
      existing = await this.prisma.message.findFirst({
        where: { clientMessageId },
        select: {
          id: true,
          createdAt: true,
        },
      });
    } catch (error) {
      // Column might not exist, skip duplicate check
      this.logger.warn(`Duplicate check skipped: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    if (existing) {
      client.emit('message:ack', {
        clientMessageId,
        serverMessageId: existing.id,
        createdAt: existing.createdAt.toISOString(),
      });
      return;
    }

    // Создание сообщения (skip clientMessageId if column doesn't exist)
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: 'visitor',
        text: text.trim(),
        // clientMessageId - column doesn't exist in DB, skip it
      },
    });

    // ACK отправителю
    client.emit('message:ack', {
      clientMessageId,
      serverMessageId: message.id,
      createdAt: message.createdAt.toISOString(),
    });

    // Отправка другим (операторам)
    this.server.to(`conversation:${conversationId}`).except(client.id).emit('message:new', {
      serverMessageId: message.id,
      conversationId,
      text: message.text,
      senderType: 'visitor',
      createdAt: message.createdAt.toISOString(),
    });
  }

  @SubscribeMessage('sync:request')
  async handleSync(client: Socket, payload: { conversationId: string; afterCreatedAt?: string; limit?: number }) {
    const { conversationId: socketConvId } = client.data;
    const { conversationId, afterCreatedAt, limit = 50 } = payload;

    if (conversationId !== socketConvId) {
      client.emit('error', { message: 'Invalid conversationId' });
      return;
    }

    const take = Math.min(Math.max(limit, 1), 200);
    const where: any = { conversationId };

    if (afterCreatedAt) {
      where.createdAt = { gt: new Date(afterCreatedAt) };
    }

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take,
    });

    client.emit('sync:response', {
      messages: messages.map((m) => ({
        serverMessageId: m.id,
        conversationId: m.conversationId,
        text: m.text,
        senderType: m.senderType,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  }

  @SubscribeMessage('presence:heartbeat')
  async handlePresence(client: Socket) {
    const { channelId, visitorId } = client.data;
    const key = `presence:channel:${channelId}:visitor:${visitorId}`;
    
    // Установить в Redis на 30 секунд
    await this.redis.setex(key, 30, '1');

    // Отправить обновление операторам (с кэшированием)
    await this.broadcastPresenceUpdate(channelId);
  }

  private async broadcastPresenceUpdate(channelId: string) {
    const cacheKey = `presence:cache:${channelId}`;
    const cached = this.presenceCache.get(cacheKey);

    // Кэш на 5 секунд
    if (cached && cached.expires > Date.now()) {
      return;
    }

    // Подсчет онлайн посетителей
    const pattern = `presence:channel:${channelId}:visitor:*`;
    const keys = await this.redis.keys(pattern);
    const count = keys.length;

    // Обновить кэш
    this.presenceCache.set(cacheKey, {
      count,
      expires: Date.now() + 5000,
    });

    // Отправить операторам
    this.server.to(`channel:${channelId}`).emit('presence:update', {
      channelId,
      onlineVisitors: count,
    });
  }
}
