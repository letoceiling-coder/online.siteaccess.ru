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
    metadata?: { usedRelay?: boolean; connectionTimeMs?: number },
  ) {
    const updateData: any = { status };
    
    if (status === 'connecting') {
      updateData.startedAt = new Date();
    }
    
    if (status === 'in_call') {
      const record = await (this.prisma as any).callRecord.findUnique({
        where: { id: callId },
        select: { startedAt: true },
      });
      
      if (record?.startedAt) {
        updateData.connectedAt = new Date();
        const connectionTime = Date.now() - new Date(record.startedAt).getTime();
        updateData.connectionTimeMs = connectionTime;
      }
      
      if (metadata?.usedRelay !== undefined) {
        updateData.usedRelay = metadata.usedRelay;
      }
    }
    
    if (status === 'ended' || status === 'failed' || status === 'busy') {
      updateData.endedAt = new Date();
      if (reason) {
        updateData.endedReason = reason;
      }
      
      const record = await (this.prisma as any).callRecord.findUnique({
        where: { id: callId },
        select: { startedAt: true, connectedAt: true },
      });
      
      if (record?.startedAt) {
        const duration = Date.now() - new Date(record.startedAt).getTime();
        updateData.durationMs = duration;
      }
    }

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

  async getCallMetrics(channelId?: string) {
    const where: any = {};
    if (channelId) {
      where.channelId = channelId;
    }

    const calls = await (this.prisma as any).callRecord.findMany({
      where,
      select: {
        status: true,
        durationMs: true,
        connectionTimeMs: true,
        usedRelay: true,
        endedReason: true,
      },
    });

    const totalCalls = calls.length;
    const successfulCalls = calls.filter((c: any) => c.status === 'ended' && c.durationMs).length;
    const busyCalls = calls.filter((c: any) => c.status === 'busy' || c.endedReason === 'busy').length;
    const failedCalls = calls.filter((c: any) => c.status === 'failed' || c.endedReason === 'failed' || c.endedReason === 'timeout').length;
    const relayCalls = calls.filter((c: any) => c.usedRelay === true).length;

    const durations = calls.filter((c: any) => c.durationMs).map((c: any) => c.durationMs);
    const connectionTimes = calls.filter((c: any) => c.connectionTimeMs).map((c: any) => c.connectionTimeMs);

    return {
      totalCalls,
      successRate: totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0,
      averageDuration: durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0,
      averageConnectionTime: connectionTimes.length > 0 ? connectionTimes.reduce((a: number, b: number) => a + b, 0) / connectionTimes.length : 0,
      relayUsagePercent: totalCalls > 0 ? (relayCalls / totalCalls) * 100 : 0,
      busyRate: totalCalls > 0 ? (busyCalls / totalCalls) * 100 : 0,
      failedRate: totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0,
    };
  }
}
