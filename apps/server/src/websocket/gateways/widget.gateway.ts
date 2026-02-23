import { WsException,
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
import { CallsGateway } from '../../calls/calls.gateway';
import { CallOfferDto } from '../../calls/dto/call-offer.dto';
import { CallAnswerDto } from '../../calls/dto/call-answer.dto';
import { CallIceDto } from '../../calls/dto/call-ice.dto';
import { CallHangupDto } from '../../calls/dto/call-hangup.dto';

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
    private callsGateway: CallsGateway,
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
      
      // Domain lock: validate origin against allowedDomains
      const origin = client.handshake.headers.origin || client.handshake.headers.referer;
      const originHost = origin ? new URL(origin).hostname : null;
      
      const channel = await this.prisma.channel.findUnique({
        where: { id: payload.channelId },
        select: { id: true, allowedDomains: true },
      });
      
      if (channel) {
        const allowedDomains = channel.allowedDomains as string[] | null;
        const channelIdPrefix = channel.id.substring(0, 8);
        
        if (allowedDomains && allowedDomains.length > 0) {
          if (!originHost || !allowedDomains.includes(originHost)) {
            this.logger.warn(`[DOMAIN_LOCK] WS Channel ${channelIdPrefix}... denied: origin=${originHost || 'missing'}, allowed=${allowedDomains.join(',')}`);
            throw new WsException('DOMAIN_NOT_ALLOWED');
          }
          this.logger.log(`[DOMAIN_LOCK] WS Channel ${channelIdPrefix}... allowed: origin=${originHost}`);
        } else {
          this.logger.warn(`[DOMAIN_LOCK] WS Channel ${channelIdPrefix}... has no allowedDomains - allowing all origins (dev mode)`);
        }
      }
      
      client.data.channelId = payload.channelId;
      client.data.visitorId = payload.visitorId;
      client.data.conversationId = payload.conversationId;
      client.data.externalId = payload.externalId;

      client.join(`channel:${payload.channelId}`);
      client.join(`conversation:${payload.conversationId}`);

      this.logger.log(`[WS_TRACE] [WIDGET] Connection success: socketId=${client.id}, channelId=${payload.channelId?.substring(0, 8)}..., conversationId=${payload.conversationId?.substring(0, 8)}...`);
      
      // [WS_TRACE] Add disconnect/error listeners for engine.io level diagnostics
      if (client.conn) {
        client.conn.on('close', (reason: string) => {
          this.logger.warn(`[WS_TRACE] [WIDGET] conn.close: socketId=${client.id}, reason=${reason || 'unknown'}`);
        });
      }
      client.on('disconnect', (reason: string) => {
        this.logger.warn(`[WS_TRACE] [WIDGET] disconnect: socketId=${client.id}, reason=${reason || 'unknown'}`);
      });
      client.on('error', (err: Error) => {
        this.logger.error(`[WS_TRACE] [WIDGET] error: socketId=${client.id}, message=${err?.message || 'unknown'}${err?.stack ? `, stack=${err.stack.substring(0, 300)}` : ''}`);
      });
    } catch (error) {
      if (error instanceof WsException && error.message === 'DOMAIN_NOT_ALLOWED') {
        this.logger.warn(`[WS_TRACE] [WIDGET] Connection rejected: domain not allowed, clientId=${client.id}`);
        client.emit('error', { message: 'DOMAIN_NOT_ALLOWED' });
        client.disconnect();
      } else {
        this.logger.warn(`[WS_TRACE] [WIDGET] Connection rejected: invalid token, clientId=${client.id}, error=${error instanceof Error ? error.message : 'unknown'}`);
        client.disconnect();
      }
    }
  }

  async handleDisconnect(client: Socket) {
    // Note: reason is not provided by NestJS OnGatewayDisconnect interface
    // We log it from the disconnect event listener added in handleConnection
    this.logger.log(`[WS_TRACE] [WIDGET] handleDisconnect: socketId=${client.id}`);
  }

  @SubscribeMessage('message:send')
  async handleMessage(client: Socket, payload: { conversationId: string; text: string; clientMessageId: string }) {
    const { conversationId: socketConvId, visitorId, channelId } = client.data;
    const { conversationId, text, clientMessageId } = payload;
    
    // [W_MSG_SAVE] Log incoming message
    const clientMsgIdPrefix = clientMessageId ? clientMessageId.substring(0, 16) : 'missing';
    this.logger.log(`[W_MSG_SAVE] Received: socketId=${client.id}, conversationId=${conversationId?.substring(0, 8)}..., clientMessageId=${clientMsgIdPrefix}..., textLength=${text?.length || 0}`);
    this.logger.log(`[W_MSG_SAVE] Client data: channelId=${channelId?.substring(0, 8) || 'missing'}..., conversationId=${socketConvId?.substring(0, 8) || 'missing'}..., visitorId=${visitorId?.substring(0, 8) || 'missing'}...`);

    // Validate conversationId (UUID format)
    if (!conversationId || typeof conversationId !== 'string' || conversationId !== socketConvId) {
      this.logger.warn(`[W_MSG_SAVE] Validation failed: conversationId mismatch, socketConvId=${socketConvId}, payloadConvId=${conversationId}`);
      client.emit('error', { message: 'Invalid conversationId' });
      return;
    }

    // Validate text
    if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 4000) {
      this.logger.warn(`[W_MSG_SAVE] Validation failed: invalid text, length=${text?.length || 0}`);
      client.emit('error', { message: 'Invalid text: must be 1-4000 chars' });
      return;
    }

    // Validate clientMessageId (REQUIRED, non-empty string)
    if (!clientMessageId || typeof clientMessageId !== 'string' || clientMessageId.trim().length === 0) {
      this.logger.warn(`[W_MSG_SAVE] Validation failed: clientMessageId missing or empty`);
      client.emit('error', { message: 'clientMessageId is required and must be a non-empty string' });
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
      this.logger.warn(`[W_MSG_SAVE] Duplicate check skipped: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    if (existing) {
      this.logger.log(`[W_MSG_SAVE] Duplicate found: clientMessageId=${clientMsgIdPrefix}..., existingId=${existing.id}`);
      client.emit('message:ack', {
        clientMessageId,
        serverMessageId: existing.id,
        createdAt: existing.createdAt.toISOString(),
      });
      return;
    }

    // Создание сообщения (using Prisma)
    const trimmedText = text.trim();
    
    let message;
    try {
      message = await this.prisma.message.create({
        data: {
          conversationId,
          senderType: 'visitor',
          senderId: null,
          text: trimmedText, // Prisma maps 'text' field to 'content' column via @map("content")
          clientMessageId: clientMessageId || null,
          // encryptionVersion has default 0 in schema
          // ciphertext is nullable, not set for plain text messages
        },
      });
      this.logger.log(`[W_MSG_SAVE] Saved: messageId=${message.id}, clientMessageId=${clientMsgIdPrefix}..., conversationId=${conversationId?.substring(0, 8)}..., senderType=visitor`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      const errorCode = (error as any)?.code;
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[W_MSG_SAVE] Prisma create failed: clientMessageId=${clientMsgIdPrefix}..., error=${errorMessage}, code=${errorCode || 'N/A'}${errorStack ? `, stack=${errorStack.substring(0, 400)}` : ''}`);
      client.emit('error', { message: 'Failed to save message' });
      return;
    }
    
    // Update conversation updatedAt
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`[W_MSG_SAVE] Conversation updateAt update failed: ${error instanceof Error ? error.message : 'unknown'}`);
      // Non-critical, continue
    }

    // ACK отправителю (ONLY after successful DB persist)
    client.emit('message:ack', {
      clientMessageId,
      serverMessageId: message.id,
      conversationId: message.conversationId,
      createdAt: message.createdAt.toISOString(),
    });
    this.logger.log(`[W_MSG_SAVE] ACK sent: clientMessageId=${clientMsgIdPrefix}..., serverMessageId=${message.id}`);

    // Emit to both widget and operator namespaces for realtime delivery
    const channelIdFromData = client.data.channelId;
    const messagePayload = {
      serverMessageId: message.id,
      conversationId,
      text: message.text,
      senderType: 'visitor',
      createdAt: message.createdAt.toISOString(),
    };

    // Emit to widget namespace (other widgets in same conversation)
    this.server.to(`conversation:${conversationId}`).except(client.id).emit('message:new', messagePayload);

    // Emit to operator namespace
    // CRITICAL: Emit to BOTH channel room (all operators) AND conversation room (joined operators)
    // Operators always join channel:{channelId} on connect, but only join conversation:{conversationId} when they open it
    const mainServer = (this.server as any).server;
    if (mainServer) {
      const operatorNamespace = mainServer.of('/operator');
      if (operatorNamespace && channelId) {
        // Emit to channel room (MANDATORY - all operators in channel receive this)
        operatorNamespace.to(`channel:${channelId}`).emit('message:new', messagePayload);
        // Also emit to conversation room (for operators who have explicitly joined)
        operatorNamespace.to(`conversation:${conversationId}`).emit('message:new', messagePayload);
        this.logger.log(`[REALTIME] Emitted message:new to operator namespace: channel:${channelId} and conversation:${conversationId}`);
      }
    }
  }

  @SubscribeMessage('sync:request')
  async handleSyncRequest(client: Socket, payload: { conversationId: string; sinceCreatedAt?: string; limit?: number }) {
    const { conversationId: socketConvId } = client.data;
    const { conversationId, sinceCreatedAt, limit = 100 } = payload;

    if (!conversationId || conversationId !== socketConvId) {
      client.emit('error', { message: 'Invalid conversationId' });
      return;
    }

    try {
      const where: any = { conversationId };
      if (sinceCreatedAt) {
        const sinceDate = new Date(sinceCreatedAt);
        if (!isNaN(sinceDate.getTime())) {
          where.createdAt = { gt: sinceDate };
        }
      }

      const messages = await this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: Math.min(limit || 100, 200), // Cap at 200
        select: {
          id: true,
          conversationId: true,
          text: true,
          senderType: true,
          senderId: true,
          clientMessageId: true,
          createdAt: true,
        },
      });

      client.emit('sync:response', {
        conversationId,
        messages: messages.map((m) => ({
          serverMessageId: m.id,
          conversationId: m.conversationId,
          text: m.text,
          senderType: m.senderType,
          senderId: m.senderId,
          clientMessageId: m.clientMessageId,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      this.logger.error(`Sync request failed: ${error instanceof Error ? error.message : 'unknown'}`, error instanceof Error ? error.stack : undefined);
      client.emit('error', { message: 'Sync request failed' });
    }
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

  @SubscribeMessage('call:offer')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: false, forbidNonWhitelisted: false }))
  async handleCallOffer(client: Socket, payload: any) {
    this.logger.log(`[CALL_TRACE] Widget received call:offer: callId=${payload?.callId}, conversationId=${payload?.conversationId}`);
    try {
      const dto = payload as CallOfferDto;
      await this.callsGateway.handleCallOffer(dto, client, 'visitor', '/widget', this.server);
      this.logger.log(`[CALL_TRACE] Widget call offer processed: callId=${dto.callId}`);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Widget call offer error: ${error instanceof Error ? error.message : 'unknown'}, callId=${payload?.callId}`);
      client.emit('call:failed', { callId: payload?.callId, reason: 'offer_failed' });
    }
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(client: Socket, payload: CallAnswerDto) {
    this.logger.log(`[CALL_TRACE] Widget received call:answer: callId=${payload?.callId}`);
    try {
      await this.callsGateway.handleCallAnswer(payload, client, '/widget', this.server);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Widget call answer error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:ice')
  async handleCallIce(client: Socket, payload: CallIceDto) {
    try {
      await this.callsGateway.handleCallIce(payload, client, '/widget', this.server);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Widget call ICE error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:hangup')
  async handleCallHangup(client: Socket, payload: CallHangupDto) {
    try {
      await this.callsGateway.handleCallHangup(payload, client, '/widget', this.server);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Widget call hangup error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:busy')
  async handleCallBusy(client: Socket, payload: CallHangupDto) {
    try {
      await this.callsGateway.handleCallBusy(payload, client, '/widget', this.server);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Widget call busy error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
