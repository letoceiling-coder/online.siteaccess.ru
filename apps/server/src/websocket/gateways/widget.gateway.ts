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
import { CallRelayDetectedDto } from '../../calls/dto/call-relay-detected.dto';

@WebSocketGateway({
  namespace: '/widget',
  cors: { origin: true, credentials: true },
})
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
      // Extract origin from multiple sources
      const originHeader = client.handshake.headers.origin;
      const refererHeader = client.handshake.headers.referer;
      const hostHeader = client.handshake.headers.host;
      const xForwardedHost = client.handshake.headers['x-forwarded-host'];
      // Normalize origin hostname
      let originHost: string | null = null;
      let originUrl: string | null = null;
      if (originHeader) {
        try {
          originUrl = originHeader;
          const url = new URL(originHeader);
          originHost = url.hostname.toLowerCase();
          // Remove port if present
          if (originHost.includes(':')) {
            originHost = originHost.split(':')[0];
          }
        } catch (e) {
          // Invalid origin URL, try to parse as hostname
          originHost = originHeader.toLowerCase();
        }
      } else if (refererHeader) {
        try {
          originUrl = refererHeader;
          const url = new URL(refererHeader);
          originHost = url.hostname.toLowerCase();
          if (originHost.includes(':')) {
            originHost = originHost.split(':')[0];
          }
        } catch (e) {
          // Invalid referer URL
      // Add packet logging middleware for widget socket
      client.use((packet, next) => {
        this.logger.log(`[WIDGET_PACKET] socketId=${client.id} event=${packet[0]} namespace=${client.nsp.name}`);
        next();
      });
        }
      }
      const channel = await this.prisma.channel.findUnique({
        where: { id: payload.channelId },
        select: { id: true, allowedDomains: true },
      });
      if (channel) {
        const allowedDomains = channel.allowedDomains as string[] | null;
        const channelIdPrefix = channel.id.substring(0, 8);
        if (allowedDomains && allowedDomains.length > 0) {
          // Normalize allowed domains (lowercase, no port)
          const normalizedAllowed = allowedDomains.map(d => d.toLowerCase().split(':')[0]);
          let allowDecision = false;
          let denyReason = '';
          if (!originHost) {
            // Missing origin: allow only in E2E test mode
            if (process.env.E2E_ALLOW_NO_ORIGIN === 'true') {
              allowDecision = true;
              denyReason = 'missing_origin_e2e_bypass';
              this.logger.warn(`[DOMAIN_LOCK_WS] E2E bypass for missing origin: channelId=${channelIdPrefix}...`);
            } else {
              allowDecision = false;
              denyReason = 'missing_origin';
            }
          } else if (normalizedAllowed.includes(originHost)) {
            allowDecision = true;
          } else {
            allowDecision = false;
            denyReason = 'origin_not_in_allowed';
          }
          // Log decision with all context
          this.logger.log(`[DOMAIN_LOCK_WS] ${allowDecision ? 'allow' : 'deny'} channelId=${channelIdPrefix}... origin=${originHost || 'missing'} originUrl=${originUrl || 'missing'} referer=${refererHeader || 'missing'} allowed=[${normalizedAllowed.join(',')}] reason=${denyReason || 'allowed'}`);
          if (!allowDecision) {
            this.logger.warn(`[DOMAIN_LOCK_WS] Connection rejected: ${denyReason}, channelId=${channelIdPrefix}...`);
            throw new WsException('DOMAIN_NOT_ALLOWED');
          }
        } else {
          this.logger.warn(`[DOMAIN_LOCK_WS] Channel ${channelIdPrefix}... has no allowedDomains - allowing all origins (dev mode)`);
        }
      }
      client.data.channelId = payload.channelId;
      client.data.visitorId = payload.visitorId;
      client.data.conversationId = payload.conversationId;
      client.data.externalId = payload.externalId;

      // Widget sockets join ONLY conversation room (not channel room)
      // This prevents duplicate message:new delivery when operator emits to both rooms
      client.join(`conversation:${payload.conversationId}`);
      // Log rooms for debugging
      const debugWs = process.env.DEBUG_WS === '1';
      if (debugWs) {
        const rooms = Array.from(client.rooms);
        this.logger.log(`[ROOMS] ns=widget socketId=${client.id} rooms=[${rooms.join(',')}]`);
      }

      this.logger.log(`[WS_TRACE] [WIDGET] Connection success: socketId=${client.id}, channelId=${payload.channelId?.substring(0, 8)}..., conversationId=${payload.conversationId?.substring(0, 8)}...`);
      // Log rooms on connect
      const rooms = Array.from(client.rooms);
      this.logger.log(`[ROOMS_ON_CONNECT] ns=widget socketId=${client.id} rooms=[${rooms.join(', ')}]`);
      // Add packet logging middleware for widget socket
      client.use((packet, next) => {
        this.logger.log(`[WIDGET_PACKET] socketId=${client.id} event=${packet[0]} namespace=${client.nsp.name}`);
        next();
      });
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

  async handleDisconnect(client: Socket, reason?: string) {
    // Note: reason is not provided by NestJS OnGatewayDisconnect interface in older versions
    // We log it from the disconnect event listener added in handleConnection
    const closeReason = (client as any).conn?.transport?.closeReason || reason || 'unknown';
    const lastEvent = (client.data as any).lastEvent || 'unknown';
    const authed = !!(client.data.channelId && client.data.conversationId);
    this.logger.log(`[DISCONNECT] ns=widget socketId=${client.id} reason=${closeReason} lastEvent=${lastEvent} authed=${authed} channelId=${client.data.channelId?.substring(0, 8) || 'missing'}... conversationId=${client.data.conversationId?.substring(0, 8) || 'missing'}...`);
  }

  @SubscribeMessage('message:send')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: false, forbidNonWhitelisted: false }))
  async handleMessage(client: Socket, payload: { conversationId: string; text: string; clientMessageId: string }) {
    const { conversationId: socketConvId, visitorId, channelId } = client.data;
    const { conversationId, text, clientMessageId } = payload;
    // [TRACE] Log incoming message
    const clientMsgIdPrefix = clientMessageId ? clientMessageId.substring(0, 16) : 'missing';
    this.logger.log(`[TRACE] [WIDGET] message:send received: socketId=${client.id}, conversationId=${conversationId?.substring(0, 8)}..., clientMessageId=${clientMsgIdPrefix}..., textLength=${text?.length || 0}`);
    this.logger.log(`[TRACE] [WIDGET] Client data: channelId=${channelId?.substring(0, 8) || 'missing'}..., conversationId=${socketConvId?.substring(0, 8) || 'missing'}..., visitorId=${visitorId?.substring(0, 8) || 'missing'}...`);

    try {
      // Validate conversationId (UUID format)
      if (!conversationId || typeof conversationId !== 'string' || conversationId !== socketConvId) {
        this.logger.warn(`[TRACE] [WIDGET] Validation failed: conversationId mismatch, socketConvId=${socketConvId}, payloadConvId=${conversationId}`);
        return { ok: false, error: 'Invalid conversationId' };
      }

      // Validate text
      if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > 4000) {
        this.logger.warn(`[TRACE] [WIDGET] Validation failed: invalid text, length=${text?.length || 0}`);
        return { ok: false, error: 'Invalid text: must be 1-4000 chars' };
      }

      // Validate clientMessageId (REQUIRED, non-empty string)
      if (!clientMessageId || typeof clientMessageId !== 'string' || clientMessageId.trim().length === 0) {
        this.logger.warn(`[TRACE] [WIDGET] Validation failed: clientMessageId missing or empty`);
        return { ok: false, error: 'clientMessageId is required and must be a non-empty string' };
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
        this.logger.log(`[TRACE] [WIDGET] Duplicate found: clientMessageId=${clientMsgIdPrefix}..., existingId=${existing.id}`);
        const ackPayload = {
          clientMessageId,
          serverMessageId: existing.id,
          createdAt: existing.createdAt.toISOString(),
        };
        client.emit('message:ack', ackPayload);
        this.logger.log(`[TRACE] [WIDGET] ACK returned (duplicate): clientMessageId=${clientMsgIdPrefix}..., serverMessageId=${existing.id}`);
        return ackPayload;
      }

      // Создание сообщения (using Prisma)
      const trimmedText = text.trim();
      this.logger.log(`[TRACE] [WIDGET] Creating message in DB: clientMessageId=${clientMsgIdPrefix}...`);
      const message = await this.prisma.message.create({
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
      this.logger.log(`[TRACE] [WIDGET] Message saved: messageId=${message.id}, clientMessageId=${clientMsgIdPrefix}..., conversationId=${conversationId?.substring(0, 8)}..., senderType=visitor`);
      // Update conversation updatedAt
      try {
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      } catch (error) {
        this.logger.warn(`[TRACE] [WIDGET] Conversation updateAt update failed: ${error instanceof Error ? error.message : 'unknown'}`);
        // Non-critical, continue
      }

      // ACK отправителю (ONLY after successful DB persist)
      // CRITICAL: Return ACK object so Socket.IO can send it as response
      const ackPayload = {
        clientMessageId,
        serverMessageId: message.id,
        conversationId: message.conversationId,
        createdAt: message.createdAt.toISOString(),
      };
      client.emit('message:ack', ackPayload);
      this.logger.log(`[TRACE] [WIDGET] ACK returned: clientMessageId=${clientMsgIdPrefix}..., serverMessageId=${message.id}`);

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
      // Widgets only join conversation room, so emit only to conversation room
      this.server.to(`conversation:${conversationId}`).except(client.id).emit('message:new', messagePayload);
      const debugWs = process.env.DEBUG_WS === '1';
      if (debugWs) {
        this.logger.log(`[MSG_EMIT] ns=widget to=conversation:${conversationId} conv=${conversationId.substring(0, 8)}... serverMessageId=${message.id} clientMessageId=${clientMsgIdPrefix}...`);
      }

      // Emit to operator namespace
      // CRITICAL: Emit to BOTH channel room (all operators) AND conversation room (joined operators)
      // Operators always join channel:{channelId} on connect, but only join conversation:{conversationId} when they open it
      // NOTE: Operators in both rooms will receive the message, but they should dedupe by serverMessageId
      const mainServer = (this.server as any).server;
      if (mainServer) {
        const operatorNamespace = mainServer.of('/operator');
        if (operatorNamespace && channelId) {
          // Emit to channel room (MANDATORY - all operators in channel receive this for list updates)
          operatorNamespace.to(`channel:${channelId}`).emit('message:new', messagePayload);
          // Also emit to conversation room (for operators who have explicitly joined the conversation)
          // Operators in both rooms will receive twice, but client must dedupe by serverMessageId
          operatorNamespace.to(`conversation:${conversationId}`).emit('message:new', messagePayload);
          if (debugWs) {
            this.logger.log(`[MSG_EMIT] ns=operator to=channel:${channelId.substring(0, 8)}... conv=${conversationId.substring(0, 8)}... serverMessageId=${message.id} clientMessageId=${clientMsgIdPrefix}...`);
            this.logger.log(`[MSG_EMIT] ns=operator to=conversation:${conversationId.substring(0, 8)}... conv=${conversationId.substring(0, 8)}... serverMessageId=${message.id} clientMessageId=${clientMsgIdPrefix}...`);
          }
        }
      }

      this.logger.log(`[TRACE] [WIDGET] message:send success: clientMessageId=${clientMsgIdPrefix}..., serverMessageId=${message.id}`);
      return ackPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error([TRACE] [WIDGET] call:relay-detected error: callId=, error=);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[TRACE] [WIDGET] message:send error: clientMessageId=${clientMsgIdPrefix}..., error=${errorMessage}${errorStack ? `, stack=${errorStack.substring(0, 400)}` : ''}`);
      return { ok: false, error: errorMessage };
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
    this.logger.log(`[TRACE] [WIDGET] call:offer received: callId=${payload?.callId}, conversationId=${payload?.conversationId}`);
    try {
      const dto = payload as CallOfferDto;
      await this.callsGateway.handleCallOffer(dto, client, 'visitor', '/widget', this.server);
      this.logger.log(`[TRACE] [WIDGET] call:offer success: callId=${dto.callId}`);
      return { ok: true, callId: dto.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [WIDGET] call:offer error: callId=${payload?.callId}, error=${errorMessage}`);
      client.emit('call:failed', { callId: payload?.callId, reason: 'offer_failed' });
      return { ok: false, error: errorMessage };
    }
  }

  @SubscribeMessage('call:answer')
  @UseGuards(WidgetAuthGuard)
  async handleCallAnswer(client: Socket, payload: any) {
    this.logger.log(`[TRACE] [WIDGET] call:answer received: callId=${payload?.callId} payload=${JSON.stringify(payload)}`);
    try {
      // Manual validation to avoid ValidationPipe blocking
      const dto: CallAnswerDto = {
        callId: payload.callId,
        conversationId: payload.conversationId,
        channelId: payload.channelId,
        fromRole: payload.fromRole,
        sdp: payload.sdp,
        timestamp: payload.timestamp,
      };
      await this.callsGateway.handleCallAnswer(dto, client, '/widget', this.server);
      this.logger.log(`[TRACE] [WIDGET] call:answer success: callId=${payload?.callId}`);
      return { ok: true, callId: payload?.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [WIDGET] call:answer error: callId=${payload?.callId}, error=${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }

  @SubscribeMessage('call:ice')
  async handleCallIce(client: Socket, payload: CallIceDto) {
    this.logger.log(`[TRACE] [WIDGET] call:ice received: callId=${payload?.callId}`);
    try {
      await this.callsGateway.handleCallIce(payload, client, '/widget', this.server);
      this.logger.log(`[TRACE] [WIDGET] call:ice success: callId=${payload?.callId}`);
      return { ok: true, callId: payload?.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [WIDGET] call:ice error: callId=${payload?.callId}, error=${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }

  @SubscribeMessage('call:hangup')
  @SubscribeMessage('call:relay-detected')
  @UseGuards(WidgetAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: false, forbidNonWhitelisted: false }))
  async handleRelayDetected(client: Socket, payload: any) {
    this.logger.log([TRACE] [WIDGET] call:relay-detected received: callId=);
    try {
    this.logger.log([TRACE] [WIDGET] call:relay-detected received: callId=);
      await this.callsGateway.handleRelayDetected(dto, client, '/widget', this.server);
      this.logger.log([TRACE] [WIDGET] call:relay-detected success: callId=);
      return { ok: true, callId: dto.callId };
      this.logger.log([TRACE] [WIDGET] call:relay-detected success: callId=);
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      return { ok: false, error: errorMessage };
    }
  }




  @SubscribeMessage('call:busy')
  async handleCallBusy(client: Socket, payload: CallHangupDto) {
    this.logger.log(`[TRACE] [WIDGET] call:busy received: callId=${payload?.callId}`);
    try {
      await this.callsGateway.handleCallBusy(payload, client, '/widget', this.server);
      this.logger.log(`[TRACE] [WIDGET] call:busy success: callId=${payload?.callId}`);
      return { ok: true, callId: payload?.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [WIDGET] call:busy error: callId=${payload?.callId}, error=${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }
}
