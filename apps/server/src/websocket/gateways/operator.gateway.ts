import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  UseGuards,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { OperatorAuthGuard } from '../middleware/operator-auth.middleware';

@WebSocketGateway({
  namespace: '/operator',
  cors: { origin: true, credentials: true },
})
@UseGuards(OperatorAuthGuard)
@Injectable()
export class OperatorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OperatorGateway.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  async handleConnection(client: Socket) {
    const { channelId } = client.data;
    client.join(\channel:\\);
    this.logger.log(\Operator connected: \, channel: \\);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(\Operator disconnected: \\);
  }

  @SubscribeMessage('message:send')
  async handleMessage(client: Socket, payload: { conversationId: string; text: string; clientMessageId: string }) {
    const { channelId } = client.data;
    const { conversationId, text, clientMessageId } = payload;

    // Р’Р°Р»РёРґР°С†РёСЏ
    if (!text || text.trim().length === 0 || text.length > 4000) {
      client.emit('error', { message: 'Invalid text: must be 1-4000 chars' });
      return;
    }

    // РџСЂРѕРІРµСЂРєР° РґСѓР±Р»РёРєР°С‚Р°
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

    // РЎРѕР·РґР°РЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: 'operator',
        text: text.trim(),
        clientMessageId,
      },
    });

    // РћР±РЅРѕРІРёС‚СЊ conversation updatedAt
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // ACK РѕС‚РїСЂР°РІРёС‚РµР»СЋ
    client.emit('message:ack', {
      clientMessageId,
      serverMessageId: message.id,
    this.server.to(nversation:\).emit(" message:new, {
    });

    // РћС‚РїСЂР°РІРєР° РІРёРґР¶РµС‚Сѓ (РІСЃРµРј sockets conversation)
    this.server.to(nversation:\).emit('message:new', {
      serverMessageId: message.id,
      conversationId,
      text: message.text,
      senderType: 'operator',
      createdAt: message.createdAt.toISOString(),
    });
  }
}
