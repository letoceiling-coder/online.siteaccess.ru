import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OperatorService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

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

  async login(email: string, password: string, channelId: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check membership (use type assertion for channelMember)
    const membership = await (this.prisma as any).channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this channel');
    }

    const payload = {
      sub: user.id,
      userId: user.id,
      channelId,
      role: membership.role,
    };

    const operatorAccessToken = this.jwtService.sign(payload, {
      secret: process.env.OPERATOR_JWT_SECRET || process.env.JWT_SECRET || 'dev-secret',
      expiresIn: '7d',
    });

    return {
      operatorAccessToken,
      user: {
        id: user.id,
        email: user.email,
      },
      channelId,
      role: membership.role,
    };
  }
}
