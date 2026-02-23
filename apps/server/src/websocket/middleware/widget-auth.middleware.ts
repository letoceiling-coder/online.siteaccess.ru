import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WidgetAuthGuard implements CanActivate {
  private readonly logger = new Logger(WidgetAuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const handler = context.getHandler();
    const handlerName = handler?.name || 'unknown';
    const eventName = context.switchToWs().getData()?.event || handlerName;

    // [GUARD TRACE] Log available token sources
    const authKeys = client.handshake.auth ? Object.keys(client.handshake.auth) : [];
    const queryKeys = client.handshake.query ? Object.keys(client.handshake.query) : [];
    const authHeader = client.handshake.headers?.authorization;

    this.logger.log(`[GUARD TRACE] [WIDGET] canActivate: socketId=${client.id}, event=${eventName}, handler=${handlerName}, authKeys=[${authKeys.join(',')}], queryKeys=[${queryKeys.join(',')}], hasAuthHeader=${!!authHeader}`);

    // Try multiple token sources
    let token: string | undefined;

    // 1) handshake.auth.token
    if (client.handshake.auth?.token && typeof client.handshake.auth.token === 'string') {
      token = client.handshake.auth.token;
      this.logger.log(`[TRACE] Token found in handshake.auth.token`);
    }
    // 2) handshake.query.token
    else if (client.handshake.query?.token && typeof client.handshake.query.token === 'string') {
      token = client.handshake.query.token;
      this.logger.log(`[TRACE] Token found in handshake.query.token`);
    }
    // 3) Authorization header (Bearer token)
    else if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      this.logger.log(`[TRACE] Token found in Authorization header`);
    }

    if (!token || typeof token !== 'string') {
      this.logger.warn(`[GUARD TRACE] [WIDGET] Token not found in any source, socketId=${client.id}, event=${eventName}`);
      // CRITICAL: Return false instead of throwing to avoid disconnect
      return false;
    }

    // Log token prefix only (no secrets)
    const tokenPrefix = token.substring(0, 10);
    this.logger.log(`[TRACE] Token prefix: ${tokenPrefix}...`);

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET') || 'dev-secret',
      });
      this.logger.log(`[TRACE] Token decoded: channelId=${payload.channelId}, conversationId=${payload.conversationId}, visitorId=${payload.visitorId}`);

      // Set client data
      client.data.channelId = payload.channelId;
      client.data.visitorId = payload.visitorId;
      client.data.conversationId = payload.conversationId;
      client.data.externalId = payload.externalId;

      // Join rooms immediately
      if (payload.channelId) {
        client.join(`channel:${payload.channelId}`);
      }
      if (payload.conversationId) {
        client.join(`conversation:${payload.conversationId}`);
      }

      this.logger.log(`[GUARD TRACE] [WIDGET] Auth SUCCESS: clientId=${client.id}, event=${eventName}, channelId=${payload.channelId}, conversationId=${payload.conversationId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`[GUARD TRACE] [WIDGET] Token verification failed: socketId=${client.id}, event=${eventName}, error=${errorMessage}`);
      // CRITICAL: Return false instead of throwing to avoid disconnect
      return false;
    }
  }
}
