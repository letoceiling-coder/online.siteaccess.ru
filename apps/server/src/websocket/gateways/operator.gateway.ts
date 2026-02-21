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

  constructor(private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const { channelId } = client.data;
    client.join(`channel:${channelId}`);
    this.logger.log(`Operator connected: ${client.id}, channel: ${channelId}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Operator disconnected: ${client.id}`);
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

    // ACK to sender
    client.emit('message:ack', {
      clientMessageId,
      serverMessageId: message.id,
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
}
