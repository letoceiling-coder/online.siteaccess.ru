import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UseGuards, UsePipes, ValidationPipe, WsException } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CallOfferDto } from './dto/call-offer.dto';
import { CallAnswerDto } from './dto/call-answer.dto';
import { CallIceDto } from './dto/call-ice.dto';
import { CallHangupDto } from './dto/call-hangup.dto';
import { WidgetAuthGuard } from '../websocket/middleware/widget-auth.middleware';
import { OperatorAuthGuard } from '../websocket/middleware/operator-auth.middleware';

// CallsGateway provides helper methods for call signaling
// Actual event handlers are in WidgetGateway and OperatorGateway
@Injectable()
export class CallsGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CallsGateway.name);

  constructor(private callsService: CallsService) {}

  // Helper method to forward call events to conversation room
  forwardCallEvent(
    namespace: '/widget' | '/operator',
    event: string,
    payload: any,
    conversationId: string,
    excludeClientId?: string,
  ) {
    const namespaceServer = this.server.of(namespace);
    const room = `conversation:${conversationId}`;
    
    this.logger.log(`Forwarding ${event} to ${namespace} room ${room}${excludeClientId ? ` (excluding ${excludeClientId})` : ''}`);
    
    if (excludeClientId) {
      namespaceServer.to(room).except(excludeClientId).emit(event, payload);
    } else {
      namespaceServer.to(room).emit(event, payload);
    }
  }

  async handleCallOffer(
    dto: CallOfferDto,
    client: Socket,
    fromRole: 'operator' | 'visitor',
    namespace: '/widget' | '/operator',
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;
    const userId = client.data.userId;
    const visitorId = client.data.visitorId;

    // Verify access
    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      userId,
      visitorId,
    );

    if (!hasAccess) {
      throw new WsException('FORBIDDEN: No access to this conversation');
    }

    if (dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN: Conversation/channel mismatch');
    }

    // Create call record
    try {
      await this.callsService.createCallRecord({
        callId: dto.callId,
        channelId: dto.channelId,
        conversationId: dto.conversationId,
        kind: dto.kind,
        createdByRole: fromRole,
        createdById: fromRole === 'operator' ? userId : visitorId,
      });
    } catch (error) {
      this.logger.error(`Failed to create call record: ${error}`);
      throw new WsException('Failed to create call record');
    }

    // Emit call:ring to both namespaces
    const ringPayload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole,
      kind: dto.kind,
      timestamp: dto.timestamp || new Date().toISOString(),
    };

    this.forwardCallEvent('/widget', 'call:ring', ringPayload, conversationId);
    this.forwardCallEvent('/operator', 'call:ring', ringPayload, conversationId);

    // Forward offer to both namespaces (excluding sender)
    const offerPayload = {
      ...ringPayload,
      sdp: dto.sdp,
    };

    this.forwardCallEvent('/widget', 'call:offer', offerPayload, conversationId, client.id);
    this.forwardCallEvent('/operator', 'call:offer', offerPayload, conversationId, client.id);

    this.logger.log(`Call offer forwarded: callId=${dto.callId}, conversationId=${conversationId}`);
  }

  async handleCallAnswer(
    dto: CallAnswerDto,
    client: Socket,
    namespace: '/widget' | '/operator',
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      client.data.userId,
      client.data.visitorId,
    );

    if (!hasAccess || dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN');
    }

    await this.callsService.updateCallStatus(dto.callId, 'in_call');

    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole: dto.fromRole,
      timestamp: dto.timestamp || new Date().toISOString(),
      sdp: dto.sdp,
    };

    await this.forwardCallEvent('/widget', 'call:answer', payload, conversationId, client.id);
    await this.forwardCallEvent('/operator', 'call:answer', payload, conversationId, client.id);

    this.logger.log(`Call answer forwarded: callId=${dto.callId}`);
  }

  async handleCallIce(
    dto: CallIceDto,
    client: Socket,
    namespace: '/widget' | '/operator',
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      client.data.userId,
      client.data.visitorId,
    );

    if (!hasAccess || dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN');
    }

    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole: dto.fromRole,
      candidate: dto.candidate,
      timestamp: dto.timestamp || new Date().toISOString(),
    };

    await this.forwardCallEvent('/widget', 'call:ice', payload, conversationId, client.id);
    await this.forwardCallEvent('/operator', 'call:ice', payload, conversationId, client.id);
  }

  async handleCallHangup(
    dto: CallHangupDto,
    client: Socket,
    namespace: '/widget' | '/operator',
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      client.data.userId,
      client.data.visitorId,
    );

    if (!hasAccess || dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN');
    }

    await this.callsService.updateCallStatus(dto.callId, 'ended', dto.reason || 'hangup');

    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole: dto.fromRole,
      reason: dto.reason || 'hangup',
      timestamp: dto.timestamp || new Date().toISOString(),
    };

    await this.forwardCallEvent('/widget', 'call:hangup', payload, conversationId);
    await this.forwardCallEvent('/operator', 'call:hangup', payload, conversationId);

    this.logger.log(`Call hangup: callId=${dto.callId}, reason=${dto.reason || 'hangup'}`);
  }

  async handleCallBusy(
    dto: CallHangupDto,
    client: Socket,
    namespace: '/widget' | '/operator',
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      client.data.userId,
      client.data.visitorId,
    );

    if (!hasAccess || dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN');
    }

    await this.callsService.updateCallStatus(dto.callId, 'busy', 'busy');

    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole: dto.fromRole,
      reason: 'busy',
      timestamp: dto.timestamp || new Date().toISOString(),
    };

    await this.forwardCallEvent('/widget', 'call:busy', payload, conversationId, client.id);
    await this.forwardCallEvent('/operator', 'call:busy', payload, conversationId, client.id);

    this.logger.log(`Call busy: callId=${dto.callId}`);
  }
}

  private async handleCallOffer(
    dto: CallOfferDto,
    client: Socket,
    fromRole: 'operator' | 'visitor',
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;
    const userId = client.data.userId;
    const visitorId = client.data.visitorId;

    // Verify access
    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      userId,
      visitorId,
    );

    if (!hasAccess) {
      throw new WsException('FORBIDDEN: No access to this conversation');
    }

    // Verify conversationId and channelId match
    if (dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN: Conversation/channel mismatch');
    }

    // Create call record
    try {
      await this.callsService.createCallRecord({
        callId: dto.callId,
        channelId: dto.channelId,
        conversationId: dto.conversationId,
        kind: dto.kind,
        createdByRole: fromRole,
        createdById: fromRole === 'operator' ? userId : visitorId,
      });
    } catch (error) {
      this.logger.error(`Failed to create call record: ${error}`);
      throw new WsException('Failed to create call record');
    }

    // Emit call:ring to the other party (in conversation room)
    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole,
      kind: dto.kind,
      timestamp: dto.timestamp || new Date().toISOString(),
    };

    // Emit to conversation room (both widget and operator namespaces)
    this.server.of('/widget').to(`conversation:${conversationId}`).emit('call:ring', payload);
    this.server.of('/operator').to(`conversation:${conversationId}`).emit('call:ring', payload);

    // Forward offer to conversation room (excluding sender)
    this.server.of('/widget').to(`conversation:${conversationId}`).except(client.id).emit('call:offer', {
      ...payload,
      sdp: dto.sdp,
    });
    this.server.of('/operator').to(`conversation:${conversationId}`).except(client.id).emit('call:offer', {
      ...payload,
      sdp: dto.sdp,
    });

    this.logger.log(`Call offer forwarded: callId=${dto.callId}, conversationId=${conversationId}`);
  }

  // Handle call:answer
  @SubscribeMessage('call:answer')
  async handleCallAnswer(
    @MessageBody() dto: CallAnswerDto,
    @ConnectedSocket() client: Socket,
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    // Verify access
    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      client.data.userId,
      client.data.visitorId,
    );

    if (!hasAccess || dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN');
    }

    // Update call status
    await this.callsService.updateCallStatus(dto.callId, 'in_call');

    // Forward answer to conversation room (excluding sender)
    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole: dto.fromRole,
      timestamp: dto.timestamp || new Date().toISOString(),
      sdp: dto.sdp,
    };

    this.server.of('/widget').to(`conversation:${conversationId}`).except(client.id).emit('call:answer', payload);
    this.server.of('/operator').to(`conversation:${conversationId}`).except(client.id).emit('call:answer', payload);

    this.logger.log(`Call answer forwarded: callId=${dto.callId}`);
  }

  // Handle call:ice
  @SubscribeMessage('call:ice')
  async handleCallIce(
    @MessageBody() dto: CallIceDto,
    @ConnectedSocket() client: Socket,
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    // Verify access
    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      client.data.userId,
      client.data.visitorId,
    );

    if (!hasAccess || dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN');
    }

    // Forward ICE candidate to conversation room (excluding sender)
    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole: dto.fromRole,
      candidate: dto.candidate,
      timestamp: dto.timestamp || new Date().toISOString(),
    };

    this.server.of('/widget').to(`conversation:${conversationId}`).except(client.id).emit('call:ice', payload);
    this.server.of('/operator').to(`conversation:${conversationId}`).except(client.id).emit('call:ice', payload);
  }

  // Handle call:hangup
  @SubscribeMessage('call:hangup')
  async handleCallHangup(
    @MessageBody() dto: CallHangupDto,
    @ConnectedSocket() client: Socket,
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    // Verify access
    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      client.data.userId,
      client.data.visitorId,
    );

    if (!hasAccess || dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN');
    }

    // Update call status
    await this.callsService.updateCallStatus(dto.callId, 'ended', dto.reason || 'hangup');

    // Forward hangup to conversation room
    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole: dto.fromRole,
      reason: dto.reason || 'hangup',
      timestamp: dto.timestamp || new Date().toISOString(),
    };

    this.server.of('/widget').to(`conversation:${conversationId}`).emit('call:hangup', payload);
    this.server.of('/operator').to(`conversation:${conversationId}`).emit('call:hangup', payload);

    this.logger.log(`Call hangup: callId=${dto.callId}, reason=${dto.reason || 'hangup'}`);
  }

  // Handle call:busy
  @SubscribeMessage('call:busy')
  async handleCallBusy(
    @MessageBody() dto: CallHangupDto,
    @ConnectedSocket() client: Socket,
  ) {
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    // Verify access
    const hasAccess = await this.callsService.verifyConversationAccess(
      dto.conversationId,
      dto.channelId,
      client.data.userId,
      client.data.visitorId,
    );

    if (!hasAccess || dto.conversationId !== conversationId || dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN');
    }

    // Update call status
    await this.callsService.updateCallStatus(dto.callId, 'busy', 'busy');

    // Forward busy to conversation room
    const payload = {
      callId: dto.callId,
      conversationId: dto.conversationId,
      channelId: dto.channelId,
      fromRole: dto.fromRole,
      reason: 'busy',
      timestamp: dto.timestamp || new Date().toISOString(),
    };

    this.server.of('/widget').to(`conversation:${conversationId}`).except(client.id).emit('call:busy', payload);
    this.server.of('/operator').to(`conversation:${conversationId}`).except(client.id).emit('call:busy', payload);

    this.logger.log(`Call busy: callId=${dto.callId}`);
  }
}
