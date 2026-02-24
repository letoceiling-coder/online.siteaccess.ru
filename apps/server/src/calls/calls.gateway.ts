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
    
    // Ensure srv is a Socket.IO Server instance
    // Get namespace from server
    let namespaceServer: any;
    if (typeof srv.of === 'function') {
      namespaceServer = srv.of(namespace);
    } else {
      // Try to get namespace from server property
      const mainServer = (srv as any).server || (srv as any).io;
      if (mainServer && typeof mainServer.of === 'function') {
        namespaceServer = mainServer.of(namespace);
      } else {
        this.logger.error(`[CALL_TRACE] Cannot forward ${event}: cannot get namespace ${namespace} from server`);
        return;
      }
    }
    
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
    } catch (error: any) {
      const errorCode = error?.code || 'unknown';
      const errorMessage = error?.message || String(error);
      const errorMeta = error?.meta ? JSON.stringify(error.meta) : 'none';
      this.logger.error(`[CALL_CREATE_ERROR] Failed to create call record: code=${errorCode}, message=${errorMessage}, meta=${errorMeta}`);
      if (error?.stack) {
        this.logger.error(`[CALL_CREATE_ERROR] Stack: ${error.stack.substring(0, 500)}`);
      }
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
    // Get widget namespace from server
    let widgetNamespace: any;
    if (server && typeof server.of === 'function') {
      widgetNamespace = server.of('/widget');
    } else {
      const mainServer = (server as any)?.server || (server as any)?.io;
      if (mainServer && typeof mainServer.of === 'function') {
        widgetNamespace = mainServer.of('/widget');
      }
    }
    
    if (widgetNamespace) {
      const conversationRoom = `conversation:${dto.conversationId}`;
      widgetNamespace.to(conversationRoom).except(client.id).emit('call:offer', offerPayload);
      this.logger.log(`[CALL_TRACE] Forwarded call:offer to widget namespace room ${conversationRoom}`);
    } else {
      this.logger.error(`[CALL_TRACE] Cannot get widget namespace for call:offer`);
    }

    // Forward to operator namespace: use conversation room (operators join explicitly)
    let operatorNamespace: any;
    if (server && typeof server.of === 'function') {
      operatorNamespace = server.of('/operator');
    } else {
      const mainServer = (server as any)?.server || (server as any)?.io;
      if (mainServer && typeof mainServer.of === 'function') {
        operatorNamespace = mainServer.of('/operator');
      }
    }
    
    if (operatorNamespace) {
      const conversationRoom = `conversation:${dto.conversationId}`;
      operatorNamespace.to(conversationRoom).except(client.id).emit('call:offer', offerPayload);
      this.logger.log(`[CALL_TRACE] Forwarded call:offer to operator namespace room ${conversationRoom}`);
    } else {
      this.logger.error(`[CALL_TRACE] Cannot get operator namespace for call:offer`);
    }

    this.logger.log(`[CALL_TRACE] Call offer forwarded: callId=${dto.callId}, conversationId=${dto.conversationId}, fromRole=${fromRole}`);
  }

  async handleCallAnswer(
    dto: CallAnswerDto,
    client: Socket,
    namespace: '/widget' | '/operator',
    server: Server,
    const channelId = client.data.channelId;
    const conversationId = client.data.conversationId;

    this.logger.log(`[CALL_FORWARD] event=call:answer ns=${namespace} conversationId=${dto.conversationId} targetRoom=conversation:${dto.conversationId}`);

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

    // Forward to widget namespace
    let widgetNamespace: any;
    if (server && typeof server.of === 'function') {
      widgetNamespace = server.of('/widget');
    } else {
      const mainServer = (server as any)?.server || (server as any)?.io;
      if (mainServer && typeof mainServer.of === 'function') {
        widgetNamespace = mainServer.of('/widget');
      }
    }
    
    if (widgetNamespace) {
      const conversationRoom = `conversation:${dto.conversationId}`;
      widgetNamespace.to(conversationRoom).except(client.id).emit('call:answer', payload);
      this.logger.log(`[CALL_TRACE] Forwarded call:answer to widget namespace room ${conversationRoom}`);
    } else {
      this.logger.error(`[CALL_TRACE] Cannot get widget namespace for call:answer`);
    }

    // Forward to operator namespace - CRITICAL: ensure operator is in conversation room
    let operatorNamespace: any;
    if (server && typeof server.of === 'function') {
      operatorNamespace = server.of('/operator');
    } else {
      const mainServer = (server as any)?.server || (server as any)?.io;
      if (mainServer && typeof mainServer.of === 'function') {
        operatorNamespace = mainServer.of('/operator');
      }
    }
    
    if (operatorNamespace) {
      const conversationRoom = `conversation:${dto.conversationId}`;
      
      // Check room membership before emitting
      const room = operatorNamespace.adapter.rooms.get(conversationRoom);
      const roomSize = room?.size || 0;
      this.logger.log(`[ROOM_CHECK] ns=operator room=conversation:${dto.conversationId} size=${roomSize}`);
      
      if (roomSize > 0) {
        operatorNamespace.to(conversationRoom).except(client.id).emit('call:answer', payload);
        this.logger.log(`[CALL_TRACE] Forwarded call:answer to operator namespace room ${conversationRoom}`);
      } else {
        this.logger.warn(`[CALL_TRACE] No operators in conversation room ${conversationRoom}, emitting to channel room as fallback`);
        // Fallback: emit to channel room
        const channelRoom = `channel:${dto.channelId}`;
        operatorNamespace.to(channelRoom).except(client.id).emit('call:answer', payload);
        this.logger.log(`[CALL_TRACE] Forwarded call:answer to operator channel room ${channelRoom} (fallback)`);
      }
    } else {
      this.logger.error(`[CALL_TRACE] Cannot get operator namespace for call:answer`);
    }

    this.logger.log(`[CALL_TRACE] Call answer forwarded: callId=${dto.callId}`);
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
