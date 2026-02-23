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
})
@UseGuards(OperatorAuthGuard)
@UsePipes(new ValidationPipe())
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
    
    this.logger.log(`[OP_WS_TRACE] Connection start: socketId=${client.id}, authKeys=[${authKeys.join(',')}], queryKeys=[${queryKeys.join(',')}], headerKeys=[${headerKeys.slice(0, 10).join(',')}...], origin=${origin}`);
    
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[OP_WS_TRACE] Connection rejected: clientId=${client.id}, error=${errorMessage}${errorStack ? `, stack=${errorStack.substring(0, 200)}` : ''}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket, reason: string) {
    this.logger.log(`[OP_WS_TRACE] Operator disconnected: socketId=${client.id}, reason=${reason || 'unknown'}`);
  }

  @SubscribeMessage('message:send')
  async handleMessage(client: Socket, payload: { conversationId: string; text: string; clientMessageId: string }) {
    const { channelId, userId } = client.data;
    const { conversationId, text, clientMessageId } = payload;

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

    // Validate text
    if (!text || text.trim().length === 0 || text.length > 4000) {
      client.emit('error', { message: 'Invalid text: must be 1-4000 chars' });
      return;
    }

    // Check for duplicate
    const existing = await this.prisma.message.findUnique({
      where: { clientMessageId },
    });

    if (existing) {
      client.emit('message:ack', {
        clientMessageId,
        serverMessageId: existing.id,
        createdAt: existing.createdAt.toISOString(),
      });
      return;
    }

    // Create message in DB (using Prisma)
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

    // Update conversation updatedAt
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // ACK to sender (ONLY after successful DB persist)
    client.emit('message:ack', {
      clientMessageId,
      serverMessageId: message.id,
      conversationId: message.conversationId,
      createdAt: message.createdAt.toISOString(),
    });

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
        this.logger.log(`[REALTIME] Emitted message:new to widget namespace for conversation:${conversationId}`);
      }
    }
  }

  @SubscribeMessage('operator:conversation:join')
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
  @UsePipes(new ValidationPipe({ transform: true, whitelist: false, forbidNonWhitelisted: false }))
  async handleCallOffer(client: Socket, payload: any) {
    this.logger.log(`[CALL_TRACE] Operator received call:offer: callId=${payload?.callId}, conversationId=${payload?.conversationId}, channelId=${payload?.channelId}`);
    try {
      const dto = payload as CallOfferDto;
      // For operators, conversationId is not in client.data initially - use dto.conversationId
      // Ensure operator joins conversation room if not already joined
      const conversationRoom = `conversation:${dto.conversationId}`;
      const rooms = Array.from(client.rooms);
      if (!rooms.includes(conversationRoom)) {
        this.logger.log(`[CALL_TRACE] Operator not in conversation room, joining: ${conversationRoom}`);
        client.join(conversationRoom);
      }
      await this.callsGateway.handleCallOffer(dto, client, 'operator', '/operator', this.server);
      this.logger.log(`[CALL_TRACE] Call offer processed: callId=${dto.callId}`);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Call offer error: ${error instanceof Error ? error.message : 'unknown'}, callId=${payload?.callId}`);
      client.emit('call:failed', { callId: payload?.callId, reason: 'offer_failed' });
    }
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(client: Socket, payload: CallAnswerDto) {
    this.logger.log(`[CALL_TRACE] Operator received call:answer: callId=${payload?.callId}`);
    try {
      await this.callsGateway.handleCallAnswer(payload, client, '/operator', this.server);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Call answer error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:ice')
  async handleCallIce(client: Socket, payload: CallIceDto) {
    try {
      await this.callsGateway.handleCallIce(payload, client, '/operator', this.server);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Call ICE error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:hangup')
  async handleCallHangup(client: Socket, payload: CallHangupDto) {
    try {
      await this.callsGateway.handleCallHangup(payload, client, '/operator', this.server);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Call hangup error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:busy')
  async handleCallBusy(client: Socket, payload: CallHangupDto) {
    try {
      await this.callsGateway.handleCallBusy(payload, client, '/operator', this.server);
    } catch (error) {
      this.logger.error(`[CALL_TRACE] Call busy error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
