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
        conversationId: true,
        text: true,
        senderType: true,
        createdAt: true,
        clientMessageId: true,
      },
    });

    return messages.map((msg) => ({
      serverMessageId: msg.id,
      conversationId: msg.conversationId,
      text: msg.text,
      senderType: msg.senderType,
      createdAt: msg.createdAt.toISOString(),
      clientMessageId: msg.clientMessageId,
    }));
  }

  async login(email: string, password: string, channelId: string) {
    try {
      // TRACE: Start login attempt
      const emailNormalized = email.trim().toLowerCase();
      this.logger.log(`[TRACE] Operator login START: email=${emailNormalized}, channelId=${channelId}`);

      // Strict lowercase lookup (no fallback)
      const user = await this.prisma.user.findUnique({
        where: { email: emailNormalized },
      });

      this.logger.log(`[TRACE] User lookup: found=${!!user}, userId=${user?.id || 'N/A'}`);

      if (!user) {
        this.logger.warn(`[TRACE] Operator login FAILED: user not found for email=${emailNormalized}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!user.passwordHash) {
        this.logger.error(`[TRACE] User ${user.id} has no passwordHash set.`);
        throw new UnauthorizedException('Invalid credentials');
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      this.logger.log(`[TRACE] Password check: isValid=${isValid}`);

      if (!isValid) {
        this.logger.warn(`[TRACE] Operator login FAILED: invalid password for userId=${user.id}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(channelId)) {
        this.logger.warn(`[TRACE] Operator login FAILED: invalid channelId format: ${channelId}`);
        throw new UnauthorizedException('Invalid channel ID format');
      }

      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { id: true, ownerUserId: true, name: true },
      });

      this.logger.log(`[TRACE] Channel lookup: found=${!!channel}, channelId=${channel?.id || 'N/A'}, ownerUserId=${channel?.ownerUserId || 'N/A'}, name=${channel?.name || 'N/A'}`);

      if (!channel) {
        this.logger.warn(`[TRACE] Operator login FAILED: channel not found channelId=${channelId}`);
        throw new UnauthorizedException('Channel not found');
      }

      let membership = await this.prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId,
            userId: user.id,
          },
        },
      }).catch((err: any) => {
        this.logger.error(`[TRACE] Prisma error finding ChannelMember: ${err.message}`, err.stack);
        throw new UnauthorizedException('Database error');
      });

      this.logger.log(`[TRACE] Membership lookup: found=${!!membership}, role=${membership?.role || 'N/A'}, membershipId=${membership?.id || 'N/A'}`);

      if (!membership && channel.ownerUserId === user.id) {
        this.logger.warn(`[TRACE] No ChannelMember found for owner. Auto-creating owner membership. userId=${user.id}, channelId=${channelId}`);
        try {
          membership = await this.prisma.channelMember.upsert({
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
          this.logger.log(`[TRACE] Auto-created owner membership: userId=${user.id}, channelId=${channelId}, role=${membership.role}`);
        } catch (error: any) {
          this.logger.error(`[TRACE] Failed to auto-create owner membership: ${error.message}`, error.stack);
          membership = await this.prisma.channelMember.findUnique({
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
        this.logger.warn(`[TRACE] Operator login FAILED: user is not a member of this channel. userId=${user.id}, channelId=${channelId}`);
        throw new ForbiddenException('Not a member of this project. Ask owner to invite you.');
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

      this.logger.log(`[TRACE] Operator login SUCCESS: userId=${user.id}, channelId=${channelId}, role=${membership.role}`);

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
      this.logger.error(`[TRACE] Operator login ERROR: ${error.constructor.name}, message=${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Login failed');
    }
  }
}
