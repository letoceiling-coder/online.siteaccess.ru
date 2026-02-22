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
import { CallsService } from '../../calls/calls.service';
import { CallsGateway } from '../../calls/calls.gateway';
import { CallOfferDto } from '../../calls/dto/call-offer.dto';
import { CallAnswerDto } from '../../calls/dto/call-answer.dto';
import { CallIceDto } from '../../calls/dto/call-ice.dto';
import { CallHangupDto } from '../../calls/dto/call-hangup.dto';

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
    private callsService: CallsService,
    private callsGateway: CallsGateway,
  ) {}

  async handleConnection(client: Socket) {
    // Guard runs for @SubscribeMessage but not for handleConnection
    // So we need to authenticate here to get channelId for room joining
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    
    if (!token || typeof token !== 'string') {
      this.logger.warn(`[REALTIME] Operator connection rejected: no token, clientId=${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('OPERATOR_JWT_SECRET') || this.config.get('JWT_SECRET') || 'dev-secret',
      });

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
        this.logger.warn(`[REALTIME] Operator connection rejected: membership not found, clientId=${client.id}`);
        client.disconnect();
        return;
      }

      // Set client data (guard will also set it, but we need it here)
      client.data.userId = payload.userId;
      client.data.channelId = payload.channelId;
      client.data.role = payload.role;

      // Join channel room (CRITICAL for receiving messages from widget)
      client.join(`channel:${payload.channelId}`);
      this.logger.log(`[REALTIME] Operator connected: clientId=${client.id}, channel: ${payload.channelId}, joined room: channel:${payload.channelId}`);
    } catch (error) {
      this.logger.warn(`[REALTIME] Operator connection rejected: invalid token, clientId=${client.id}, error=${error instanceof Error ? error.message : 'unknown'}`);
      client.disconnect();
    }
  }

  async   handleDisconnect(client: Socket) {
    const reason = (client as any).disconnectReason || 'unknown';
    this.logger.log(`[TRACE_WS] Operator disconnected: clientId=${client.id}, reason=${reason}, channelId=${client.data.channelId || 'none'}`);
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
  async handleCallOffer(client: Socket, payload: CallOfferDto) {
    try {
      await this.callsGateway.handleCallOffer(payload, client, 'operator', '/operator', this.server);
    } catch (error) {
      this.logger.error(`Call offer error: ${error instanceof Error ? error.message : 'unknown'}`);
      client.emit('call:failed', { callId: payload.callId, reason: 'offer_failed' });
    }
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(client: Socket, payload: CallAnswerDto) {
    try {
      await this.callsGateway.handleCallAnswer(payload, client, '/operator', this.server);
    } catch (error) {
      this.logger.error(`Call answer error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:ice')
  async handleCallIce(client: Socket, payload: CallIceDto) {
    try {
      await this.callsGateway.handleCallIce(payload, client, '/operator', this.server);
    } catch (error) {
      this.logger.error(`Call ICE error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:hangup')
  async handleCallHangup(client: Socket, payload: CallHangupDto) {
    try {
      await this.callsGateway.handleCallHangup(payload, client, '/operator', this.server);
    } catch (error) {
      this.logger.error(`Call hangup error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  @SubscribeMessage('call:busy')
  async handleCallBusy(client: Socket, payload: CallHangupDto) {
    try {
      await this.callsGateway.handleCallBusy(payload, client, '/operator', this.server);
    } catch (error) {
      this.logger.error(`Call busy error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
