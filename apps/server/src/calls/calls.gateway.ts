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
import { Injectable, Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { CallsService } from './calls.service';
import { CallOfferDto } from './dto/call-offer.dto';
import { CallAnswerDto } from './dto/call-answer.dto';
import { CallIceDto } from './dto/call-ice.dto';
import { CallHangupDto } from './dto/call-hangup.dto';
import { WidgetAuthGuard } from '../websocket/middleware/widget-auth.middleware';
import { OperatorAuthGuard } from '../websocket/middleware/operator-auth.middleware';

// CallsGateway provides helper methods for call signaling
// Actual event handlers are in WidgetGateway and OperatorGateway
// Note: CallsGateway needs access to server from WidgetGateway/OperatorGateway
@Injectable()
export class CallsGateway {
  private readonly logger = new Logger(CallsGateway.name);

  constructor(private callsService: CallsService) {}
  
  // Server will be injected by WidgetGateway/OperatorGateway
  private server: Server | null = null;
  
  setServer(server: Server) {
    this.server = server;
  }

  // Helper method to forward call events to conversation room
  forwardCallEvent(
    namespace: '/widget' | '/operator',
    event: string,
    payload: any,
    conversationId: string,
    excludeClientId?: string,
    server?: Server,
  ) {
    const srv = server || this.server;
    if (!srv) {
      this.logger.error(`[CALL_TRACE] Cannot forward ${event}: server not available`);
      return;
    }
    
    const namespaceServer = srv.of(namespace);
    const room = `conversation:${conversationId}`;
    
    this.logger.log(`[CALL_TRACE] Forwarding ${event} to ${namespace} room ${room}${excludeClientId ? ` (excluding ${excludeClientId})` : ''}`);
    
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
    server: Server,
  ) {
    const channelId = client.data.channelId;
    const clientConversationId = client.data.conversationId; // May be undefined for operators
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

    // For operators, conversationId is not in client.data (they join rooms dynamically)
    // For widgets, conversationId is set during connection
    if (fromRole === 'visitor' && clientConversationId && dto.conversationId !== clientConversationId) {
      throw new WsException('FORBIDDEN: Conversation mismatch');
    }
    
    if (dto.channelId !== channelId) {
      throw new WsException('FORBIDDEN: Channel mismatch');
    }
    
    // Ensure operator is in conversation room (for operators, join if not already)
    if (fromRole === 'operator') {
      const rooms = Array.from(client.rooms);
      const conversationRoom = `conversation:${dto.conversationId}`;
      if (!rooms.includes(conversationRoom)) {
        this.logger.log(`[CALL_TRACE] Operator not in conversation room, joining: ${conversationRoom}`);
        client.join(conversationRoom);
      }
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

    this.forwardCallEvent('/widget', 'call:ring', ringPayload, dto.conversationId, undefined, server);
    this.forwardCallEvent('/operator', 'call:ring', ringPayload, dto.conversationId, undefined, server);

    // Forward offer to both namespaces (excluding sender)
    const offerPayload = {
      ...ringPayload,
      sdp: dto.sdp,
    };

    // Forward to widget namespace: use conversation room (widgets join on connect)
    // Also try channel room as fallback
    this.forwardCallEvent('/widget', 'call:offer', offerPayload, dto.conversationId, client.id, server);
    // Also emit to channel room as fallback for widgets
    const widgetNamespace = server.of('/widget');
    if (widgetNamespace) {
      const channelRoom = `channel:${dto.channelId}`;
      widgetNamespace.to(channelRoom).except(client.id).emit('call:offer', offerPayload);
      this.logger.log(`[CALL_TRACE] Forwarded call:offer to widget channel room: ${channelRoom}`);
    }

    // Forward to operator namespace: use conversation room (operators join explicitly)
    this.forwardCallEvent('/operator', 'call:offer', offerPayload, dto.conversationId, client.id, server);

    this.logger.log(`[CALL_TRACE] Call offer forwarded: callId=${dto.callId}, conversationId=${dto.conversationId}, fromRole=${fromRole}`);
  }

  async handleCallAnswer(
    dto: CallAnswerDto,
    client: Socket,
    namespace: '/widget' | '/operator',
    server: Server,
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

    this.forwardCallEvent('/widget', 'call:answer', payload, conversationId, client.id, server);
    this.forwardCallEvent('/operator', 'call:answer', payload, conversationId, client.id, server);

    this.logger.log(`Call answer forwarded: callId=${dto.callId}`);
  }

  async handleCallIce(
    dto: CallIceDto,
    client: Socket,
    namespace: '/widget' | '/operator',
    server: Server,
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

    this.forwardCallEvent('/widget', 'call:ice', payload, conversationId, client.id, server);
    this.forwardCallEvent('/operator', 'call:ice', payload, conversationId, client.id, server);
  }

  async handleCallHangup(
    dto: CallHangupDto,
    client: Socket,
    namespace: '/widget' | '/operator',
    server: Server,
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

    this.forwardCallEvent('/widget', 'call:hangup', payload, conversationId, undefined, server);
    this.forwardCallEvent('/operator', 'call:hangup', payload, conversationId, undefined, server);

    this.logger.log(`Call hangup: callId=${dto.callId}, reason=${dto.reason || 'hangup'}`);
  }

  async handleCallBusy(
    dto: CallHangupDto,
    client: Socket,
    namespace: '/widget' | '/operator',
    server: Server,
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

    this.forwardCallEvent('/widget', 'call:busy', payload, conversationId, client.id, server);
    this.forwardCallEvent('/operator', 'call:busy', payload, conversationId, client.id, server);

    this.logger.log(`Call busy: callId=${dto.callId}`);
  }
}
