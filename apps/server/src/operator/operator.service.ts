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
    try {
      this.logger.log(`Operator login attempt: email=${email}, channelId=${channelId}`);

      // Normalize email to lowercase for case-insensitive search
      const normalizedEmail = email.toLowerCase().trim();

      const user = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user) {
        this.logger.warn(`Operator login failed: user not found for email=${normalizedEmail}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      this.logger.log(`User found: userId=${user.id}`);

      // Validate password hash exists
      if (!user.passwordHash) {
        this.logger.error(`Operator login failed: passwordHash is null for userId=${user.id}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);

      if (!isValid) {
        this.logger.warn(`Operator login failed: invalid password for userId=${user.id}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      // Validate channelId is UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(channelId)) {
        this.logger.warn(`Operator login failed: invalid channelId format: ${channelId}`);
        throw new UnauthorizedException('Invalid channel ID format');
      }

      // Check channel exists
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { id: true, ownerUserId: true, name: true },
      });

      if (!channel) {
        this.logger.warn(`Operator login failed: channel not found channelId=${channelId}`);
        throw new UnauthorizedException('Channel not found');
      }

      this.logger.log(`Channel found: channelId=${channelId}, ownerUserId=${channel.ownerUserId}, name=${channel.name}`);

      // Check membership (use type assertion for channelMember)
      let membership = await (this.prisma as any).channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId,
            userId: user.id,
          },
        },
      }).catch((err: any) => {
        this.logger.error(`Prisma error finding ChannelMember: ${err.message}`, err.stack);
        throw new UnauthorizedException('Database error');
      });

      this.logger.log(`ChannelMember lookup result: ${membership ? `found, role=${membership.role}` : 'not found'}`);

      // Fallback: if user is owner and no membership found, auto-create owner membership
      if (!membership && channel.ownerUserId === user.id) {
        this.logger.warn(`No ChannelMember found for owner userId=${user.id}, channelId=${channelId}. Auto-creating owner membership.`);
        try {
          membership = await (this.prisma as any).channelMember.upsert({
            where: {
              channelId_userId: {
                channelId,
                userId: user.id,
              },
            },
            update: {
              role: 'owner',
            },
            create: {
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
          }).catch(() => null);
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
        channel: {
          id: channel.id,
          name: channel.name,
        },
        channelId,
        role: membership.role,
      };
    } catch (error: any) {
      // Re-throw HttpExceptions as-is
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      // Log unexpected errors
      this.logger.error(`Unexpected error in operator login: ${error.message}`, error.stack);
      throw new UnauthorizedException('Login failed');
    }
  }
}
