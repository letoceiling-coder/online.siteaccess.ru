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
    // Log input data
    this.logger.log(`[CALL_CREATE_INPUT] callId=${data.callId}, channelId=${data.channelId?.substring(0, 8)}..., conversationId=${data.conversationId?.substring(0, 8)}..., kind=${data.kind}, createdByRole=${data.createdByRole}, createdById=${data.createdById?.substring(0, 8) || 'undefined'}...`);

    // Verify data integrity before create
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: data.conversationId },
      select: { id: true, channelId: true },
    });

    if (!conversation) {
      this.logger.error(`[CALL_CREATE_ERROR] Conversation not found: conversationId=${data.conversationId}`);
      throw new Error(`Conversation not found: ${data.conversationId}`);
    }

    if (conversation.channelId !== data.channelId) {
      this.logger.warn(`[CALL_CREATE_WARN] Channel mismatch: conversation.channelId=${conversation.channelId}, provided.channelId=${data.channelId}. Using conversation.channelId.`);
      // Use conversation's channelId instead of provided one (conversation is source of truth)
      data.channelId = conversation.channelId;
    }

    // Check if callId already exists
    const existing = await (this.prisma as any).callRecord.findUnique({
      where: { id: data.callId },
      select: { id: true },
    });

    if (existing) {
      this.logger.warn(`[CALL_CREATE_ERROR] CallRecord already exists: callId=${data.callId}`);
      // Return existing record instead of failing
      return existing;
    }

    try {
      const record = await (this.prisma as any).callRecord.create({
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
      this.logger.log(`[CALL_CREATE_SUCCESS] callId=${data.callId}, recordId=${record.id}`);
      return record;
    } catch (e: any) {
      this.logger.error(`[CALL_CREATE_ERROR] Prisma error: code=${e.code}, message=${e.message}, meta=${JSON.stringify(e.meta || {})}`);
      throw e;
    }
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

    // @ts-ignore - Prisma client may not have callRecord yet, but it should after migration
    return (this.prisma as any).callRecord.update({
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
    });

    if (!conversation || conversation.channelId !== channelId) {
      return false;
    }

    // Operator access: check membership
    if (userId) {
      const membership = await this.prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId,
            userId,
          },
        },
      });
      if (!membership || (membership.role !== 'operator' && membership.role !== 'owner')) {
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
    // @ts-ignore - Prisma client may not have callRecord yet, but it should after migration
    return (this.prisma as any).callRecord.findUnique({
      where: { id: callId },
    });
  }
}
