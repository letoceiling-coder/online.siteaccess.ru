import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(private prisma: PrismaService) {}

  async createCallRecord(data: {
    callId: string;
    channelId: string;
    conversationId: string;
    kind: 'audio' | 'video';
    createdByRole: 'operator' | 'visitor';
    createdById?: string;
  }) {
    return this.prisma.callRecord.create({
      data: {
        id: data.callId,
        channelId: data.channelId,
        conversationId: data.conversationId,
        kind: data.kind,
        status: 'ringing',
        createdByRole: data.createdByRole,
        createdById: data.createdById,
      },
    });
  }

  async updateCallStatus(
    callId: string,
    status: 'ringing' | 'connecting' | 'in_call' | 'ended' | 'failed' | 'busy',
    reason?: string,
  ) {
    const updateData: any = { status };
    
    if (status === 'in_call' && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }
    
    if (status === 'ended' || status === 'failed' || status === 'busy') {
      updateData.endedAt = new Date();
      if (reason) {
        updateData.endedReason = reason;
      }
    }

    return this.prisma.callRecord.update({
      where: { id: callId },
      data: updateData,
    });
  }

  async verifyConversationAccess(
    conversationId: string,
    channelId: string,
    userId?: string,
    visitorId?: string,
  ): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        channel: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!conversation || conversation.channelId !== channelId) {
      return false;
    }

    // Operator access: check membership
    if (userId) {
      const isMember = conversation.channel.members.some(
        (m) => m.userId === userId && m.role === 'operator',
      );
      if (!isMember) {
        return false;
      }
    }

    // Visitor access: check visitorId matches
    if (visitorId) {
      if (conversation.visitorId !== visitorId) {
        return false;
      }
    }

    return true;
  }

  async getCallRecord(callId: string) {
    return this.prisma.callRecord.findUnique({
      where: { id: callId },
    });
  }
}
