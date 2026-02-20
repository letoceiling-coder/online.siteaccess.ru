import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OperatorService {
  private readonly logger = new Logger(OperatorService.name);

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
    this.logger.log(`Operator login attempt: email=${email}, channelId=${channelId}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      this.logger.warn(`Operator login failed: user not found for email=${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User found: userId=${user.id}`);

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      this.logger.warn(`Operator login failed: invalid password for userId=${user.id}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check channel exists
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, ownerUserId: true },
    });

    if (!channel) {
      this.logger.warn(`Operator login failed: channel not found channelId=${channelId}`);
      throw new UnauthorizedException('Channel not found');
    }

    this.logger.log(`Channel found: channelId=${channelId}, ownerUserId=${channel.ownerUserId}`);

    // Check membership (use type assertion for channelMember)
    let membership = await (this.prisma as any).channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId: user.id,
        },
      },
    });

    this.logger.log(`ChannelMember lookup result: ${membership ? `found, role=${membership.role}` : 'not found'}`);

    // Fallback: if user is owner and no membership found, auto-create owner membership
    if (!membership && channel.ownerUserId === user.id) {
      this.logger.warn(`No ChannelMember found for owner userId=${user.id}, channelId=${channelId}. Auto-creating owner membership.`);
      try {
        membership = await (this.prisma as any).channelMember.create({
          data: {
            channelId,
            userId: user.id,
            role: 'owner',
          },
        });
        this.logger.log(`Auto-created owner membership: userId=${user.id}, channelId=${channelId}`);
      } catch (error: any) {
        this.logger.error(`Failed to auto-create owner membership: ${error.message}`, error.stack);
        // Continue to check - maybe it was created concurrently
        membership = await (this.prisma as any).channelMember.findUnique({
          where: {
            channelId_userId: {
              channelId,
              userId: user.id,
            },
          },
        });
      }
    }

    if (!membership) {
      this.logger.warn(`Operator login failed: user is not a member of this channel. userId=${user.id}, channelId=${channelId}`);
      throw new UnauthorizedException('User is not a member of this channel');
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

    this.logger.log(`Operator login successful: userId=${user.id}, channelId=${channelId}, role=${membership.role}`);

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
