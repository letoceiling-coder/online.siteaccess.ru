import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { OperatorAuthGuard } from '../middleware/operator-auth.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CallsGateway } from '../../calls/calls.gateway';
import { CallOfferDto } from '../../calls/dto/call-offer.dto';
import { CallAnswerDto } from '../../calls/dto/call-answer.dto';
import { CallIceDto } from '../../calls/dto/call-ice.dto';
import { CallHangupDto } from '../../calls/dto/call-hangup.dto';
import { WsException } from '@nestjs/websockets';

@WebSocketGateway({
  namespace: '/operator',
  cors: { origin: true, credentials: true },
  pingInterval: 25000, // Send ping every 25 seconds
  pingTimeout: 60000,  // Wait 60 seconds for pong before considering connection dead
})
@Injectable()
export class OperatorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OperatorGateway.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private callsGateway: CallsGateway,
  ) {}

  async handleConnection(client: Socket) {
    // Guard runs for @SubscribeMessage but not for handleConnection
    // So we need to authenticate here to get channelId for room joining
    
    // [OP_WS_TRACE] Connection start diagnostics
    const authKeys = Object.keys(client.handshake.auth || {});
    const queryKeys = Object.keys(client.handshake.query || {});
    const headerKeys = Object.keys(client.handshake.headers || {});
    const origin = client.handshake.headers.origin || client.handshake.headers.referer || 'missing';
    const authToken = client.handshake.auth?.token;
    const queryToken = client.handshake.query?.token;
    const headerAuth = client.handshake.headers.authorization;
    
    this.logger.log(`[OP_WS_TRACE] Connection start: socketId=${client.id}, authKeys=[${authKeys.join(',')}], queryKeys=[${queryKeys.join(',')}], headerKeys=[${headerKeys.slice(0, 10).join(',')}...], origin=${origin}`);
    this.logger.log(`[OP_WS_TRACE] Token sources: auth.token=${!!authToken}, query.token=${!!queryToken}, headers.authorization=${!!headerAuth}`);
    
    // Try multiple token sources: auth.token, query.token, Authorization header
    let token = authToken || queryToken;
    if (!token && headerAuth && headerAuth.startsWith('Bearer ')) {
      token = headerAuth.substring(7);
    }
    
    if (!token || typeof token !== 'string') {
      this.logger.warn(`[OP_WS_TRACE] Connection rejected: no token, clientId=${client.id}`);
      client.disconnect(true);
      return;
    }

    // [OP_WS_TRACE] Token presence
    const tokenPrefix = token.substring(0, 8);
    const tokenLength = token.length;
    this.logger.log(`[OP_WS_TRACE] Token found: length=${tokenLength}, prefix=${tokenPrefix}...`);

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('OPERATOR_JWT_SECRET') || this.config.get('JWT_SECRET') || 'dev-secret',
      });

      this.logger.log(`[OP_WS_TRACE] JWT verify success: userId=${payload.userId}, channelId=${payload.channelId?.substring(0, 8)}...`);

      // Verify membership (guard will do this too, but we need channelId here)
      const membership = await this.prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId: payload.channelId,
            userId: payload.userId,
          },
        },
      });

      if (!membership) {
        this.logger.warn(`[OP_WS_TRACE] Connection rejected: membership not found, clientId=${client.id}, userId=${payload.userId}, channelId=${payload.channelId?.substring(0, 8)}...`);
        client.disconnect(true);
        return;
      }

      // Set client data (guard will also set it, but we need it here)
      client.data.userId = payload.userId;
      client.data.channelId = payload.channelId;
      client.data.role = payload.role;

      // Join channel room (CRITICAL for receiving messages from widget)
      client.join(`channel:${payload.channelId}`);
      this.logger.log(`[OP_WS_TRACE] Connection success: clientId=${client.id}, channelId=${payload.channelId?.substring(0, 8)}..., joined room: channel:${payload.channelId}`);
      
      // [WS_TRACE] Add disconnect/error listeners for engine.io level diagnostics
      if (client.conn) {
        client.conn.on('close', (reason: string) => {
          this.logger.warn(`[WS_TRACE] [OP] conn.close: socketId=${client.id}, reason=${reason || 'unknown'}`);
        });
      }
      client.on('disconnect', (reason: string) => {
        this.logger.warn(`[WS_TRACE] [OP] disconnect: socketId=${client.id}, reason=${reason || 'unknown'}`);
      });
      client.on('error', (err: Error) => {
        this.logger.error(`[WS_TRACE] [OP] error: socketId=${client.id}, message=${err?.message || 'unknown'}${err?.stack ? `, stack=${err.stack.substring(0, 300)}` : ''}`);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[OP_WS_TRACE] Connection rejected: clientId=${client.id}, error=${errorMessage}${errorStack ? `, stack=${errorStack.substring(0, 200)}` : ''}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket, reason?: string) {
    // Note: reason is not provided by NestJS OnGatewayDisconnect interface in older versions
    // We log it from the disconnect event listener added in handleConnection
    const closeReason = (client as any).conn?.transport?.closeReason || reason || 'unknown';
    this.logger.log(`[TRACE] [OP] handleDisconnect: socketId=${client.id}, reason=${closeReason}`);
  }

  @SubscribeMessage('message:send')
  @UseGuards(OperatorAuthGuard)
  @UsePipes(new ValidationPipe())
  async handleMessage(client: Socket, payload: { conversationId: string; text: string; clientMessageId: string }) {
    const { channelId, userId } = client.data;
    const { conversationId, text, clientMessageId } = payload;

    const clientMsgIdPrefix = clientMessageId ? clientMessageId.substring(0, 16) : 'missing';
    this.logger.log(`[TRACE] [OP] message:send received: socketId=${client.id}, conversationId=${conversationId?.substring(0, 8)}..., clientMessageId=${clientMsgIdPrefix}..., textLength=${text?.length || 0}`);

    try {
      // Validate conversation belongs to channel
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { channel: true },
      });

      if (!conversation || conversation.channelId !== channelId) {
        this.logger.warn(`[TRACE] [OP] Validation failed: conversationId mismatch or not found`);
        return { ok: false, error: 'Invalid conversationId' };
      }

      // Validate operator membership
      const membership = await this.prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId,
            userId,
          },
        },
      });

      if (!membership) {
        this.logger.warn(`[TRACE] [OP] Validation failed: membership not found`);
        return { ok: false, error: 'Not a member of this channel' };
      }

      // Validate text
      if (!text || text.trim().length === 0 || text.length > 4000) {
        this.logger.warn(`[TRACE] [OP] Validation failed: invalid text, length=${text?.length || 0}`);
        return { ok: false, error: 'Invalid text: must be 1-4000 chars' };
      }

      // Check for duplicate
      const existing = await this.prisma.message.findUnique({
        where: { clientMessageId },
      });

      if (existing) {
        this.logger.log(`[TRACE] [OP] Duplicate found: clientMessageId=${clientMsgIdPrefix}..., existingId=${existing.id}`);
        const ackPayload = {
          clientMessageId,
          serverMessageId: existing.id,
          createdAt: existing.createdAt.toISOString(),
        };
        client.emit('message:ack', ackPayload);
        this.logger.log(`[TRACE] [OP] ACK returned (duplicate): clientMessageId=${clientMsgIdPrefix}..., serverMessageId=${existing.id}`);
        return ackPayload;
      }

      // Create message in DB (using Prisma)
      this.logger.log(`[TRACE] [OP] Creating message in DB: clientMessageId=${clientMsgIdPrefix}...`);
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          senderType: 'operator',
          senderId: userId,
          text: text.trim(), // Prisma maps 'text' field to 'content' column via @map("content")
          clientMessageId: clientMessageId || null,
          // encryptionVersion has default 0 in schema
          // ciphertext is nullable, not set for plain text messages
        },
      });
      this.logger.log(`[TRACE] [OP] Message saved: messageId=${message.id}, clientMessageId=${clientMsgIdPrefix}...`);

      // Update conversation updatedAt
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      // ACK to sender (ONLY after successful DB persist)
      // CRITICAL: Return ACK object so Socket.IO can send it as response
      const ackPayload = {
        clientMessageId,
        serverMessageId: message.id,
        conversationId: message.conversationId,
        createdAt: message.createdAt.toISOString(),
      };
      client.emit('message:ack', ackPayload);
      this.logger.log(`[TRACE] [OP] ACK returned: clientMessageId=${clientMsgIdPrefix}..., serverMessageId=${message.id}`);

      // Emit to both widget and operator namespaces for realtime delivery
      const messagePayload = {
        serverMessageId: message.id,
        conversationId,
        text: message.text,
        senderType: 'operator',
        senderId: userId,
        createdAt: message.createdAt.toISOString(),
      };

      // Emit to operator namespace (other operators in same conversation)
      this.server.to(`conversation:${conversationId}`).except(client.id).emit('message:new', messagePayload);

      // Emit to widget namespace (widgets watching this conversation)
      // Access main server to get widget namespace
      const mainServer = (this.server as any).server;
      if (mainServer) {
        const widgetNamespace = mainServer.of('/widget');
        if (widgetNamespace) {
          widgetNamespace.to(`conversation:${conversationId}`).emit('message:new', messagePayload);
          this.logger.log(`[TRACE] [OP] Emitted message:new to widget namespace for conversation:${conversationId}`);
        }
      }

      this.logger.log(`[TRACE] [OP] message:send success: clientMessageId=${clientMsgIdPrefix}..., serverMessageId=${message.id}`);
      return ackPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[TRACE] [OP] message:send error: clientMessageId=${clientMsgIdPrefix}..., error=${errorMessage}${errorStack ? `, stack=${errorStack.substring(0, 400)}` : ''}`);
      return { ok: false, error: errorMessage };
    }
  }

  @SubscribeMessage('operator:conversation:join')
  @UseGuards(OperatorAuthGuard)
  @UsePipes(new ValidationPipe())
  async handleConversationJoin(client: Socket, payload: { conversationId: string }) {
    const { channelId, userId } = client.data;
    const { conversationId } = payload;

    // Validate conversation belongs to channel
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { channel: true },
    });

    if (!conversation || conversation.channelId !== channelId) {
      client.emit('error', { message: 'Invalid conversationId' });
      return;
    }

    // Validate operator membership
    const membership = await this.prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
    });

    if (!membership) {
      client.emit('error', { message: 'Not a member of this channel' });
      return;
    }

    // Join conversation room
    client.join(`conversation:${conversationId}`);
    this.logger.log(`[REALTIME] Operator ${userId} joined conversation:${conversationId}`);
    client.emit('operator:conversation:joined', { conversationId });
  }

  @SubscribeMessage('sync:request')
  @UseGuards(OperatorAuthGuard)
  @UsePipes(new ValidationPipe())
  async handleSyncRequest(client: Socket, payload: { conversationId: string; sinceCreatedAt?: string; limit?: number }) {
    const { channelId, userId } = client.data;
    const { conversationId, sinceCreatedAt, limit = 100 } = payload;

    if (!conversationId || typeof conversationId !== 'string') {
      client.emit('error', { message: 'Invalid conversationId' });
      return;
    }

    // Validate conversation belongs to channel
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, channelId: true },
    });

    if (!conversation || conversation.channelId !== channelId) {
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

  @SubscribeMessage('call:offer')
  @UseGuards(OperatorAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: false, forbidNonWhitelisted: false }))
  async handleCallOffer(client: Socket, payload: any) {
    this.logger.log(`[TRACE] [OP] call:offer received: callId=${payload?.callId}, conversationId=${payload?.conversationId}, channelId=${payload?.channelId}`);
    try {
      const dto = payload as CallOfferDto;
      // For operators, conversationId is not in client.data initially - use dto.conversationId
      // Ensure operator joins conversation room if not already joined
      const conversationRoom = `conversation:${dto.conversationId}`;
      const rooms = Array.from(client.rooms);
      if (!rooms.includes(conversationRoom)) {
        this.logger.log(`[TRACE] [OP] Operator not in conversation room, joining: ${conversationRoom}`);
        client.join(conversationRoom);
      }
      await this.callsGateway.handleCallOffer(dto, client, 'operator', '/operator', this.server);
      this.logger.log(`[TRACE] [OP] call:offer success: callId=${dto.callId}`);
      return { ok: true, callId: dto.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [OP] call:offer error: callId=${payload?.callId}, error=${errorMessage}`);
      client.emit('call:failed', { callId: payload?.callId, reason: 'offer_failed' });
      return { ok: false, error: errorMessage };
    }
  }

  @SubscribeMessage('call:answer')
  @UseGuards(OperatorAuthGuard)
  async handleCallAnswer(client: Socket, payload: CallAnswerDto) {
    this.logger.log(`[TRACE] [OP] call:answer received: callId=${payload?.callId}`);
    try {
      await this.callsGateway.handleCallAnswer(payload, client, '/operator', this.server);
      this.logger.log(`[TRACE] [OP] call:answer success: callId=${payload?.callId}`);
      return { ok: true, callId: payload?.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [OP] call:answer error: callId=${payload?.callId}, error=${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }

  @SubscribeMessage('call:ice')
  @UseGuards(OperatorAuthGuard)
  async handleCallIce(client: Socket, payload: CallIceDto) {
    this.logger.log(`[TRACE] [OP] call:ice received: callId=${payload?.callId}`);
    try {
      await this.callsGateway.handleCallIce(payload, client, '/operator', this.server);
      this.logger.log(`[TRACE] [OP] call:ice success: callId=${payload?.callId}`);
      return { ok: true, callId: payload?.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [OP] call:ice error: callId=${payload?.callId}, error=${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }

  @SubscribeMessage('call:hangup')
  @UseGuards(OperatorAuthGuard)
  async handleCallHangup(client: Socket, payload: CallHangupDto) {
    this.logger.log(`[TRACE] [OP] call:hangup received: callId=${payload?.callId}`);
    try {
      await this.callsGateway.handleCallHangup(payload, client, '/operator', this.server);
      this.logger.log(`[TRACE] [OP] call:hangup success: callId=${payload?.callId}`);
      return { ok: true, callId: payload?.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [OP] call:hangup error: callId=${payload?.callId}, error=${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }

  @SubscribeMessage('call:busy')
  @UseGuards(OperatorAuthGuard)
  async handleCallBusy(client: Socket, payload: CallHangupDto) {
    this.logger.log(`[TRACE] [OP] call:busy received: callId=${payload?.callId}`);
    try {
      await this.callsGateway.handleCallBusy(payload, client, '/operator', this.server);
      this.logger.log(`[TRACE] [OP] call:busy success: callId=${payload?.callId}`);
      return { ok: true, callId: payload?.callId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[TRACE] [OP] call:busy error: callId=${payload?.callId}, error=${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }
}
