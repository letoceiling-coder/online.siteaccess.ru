import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OperatorService {
  constructor(private prisma: PrismaService) {}

  async getConversations(channelId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { channelId },
      include: {
        visitor: {
          select: {
            externalId: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            text: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return conversations.map((conv) => ({
      conversationId: conv.id,
      visitorExternalId: conv.visitor.externalId,
      updatedAt: conv.updatedAt.toISOString(),
      lastMessageText: conv.messages[0]?.text || null,
    }));
  }

  async getMessages(conversationId: string, limit: number = 50) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        text: true,
        senderType: true,
        createdAt: true,
      },
    });

    return messages.map((msg) => ({
      serverMessageId: msg.id,
      text: msg.text,
      senderType: msg.senderType,
      createdAt: msg.createdAt.toISOString(),
    }));
  }
}
