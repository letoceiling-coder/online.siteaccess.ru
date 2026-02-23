import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OperatorAuthGuard implements CanActivate {
  private readonly logger = new Logger(OperatorAuthGuard.name);

  constructor(
    private config: ConfigService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    
    // [GUARD TRACE] Guard activation (only for @SubscribeMessage, not handleConnection)
    // Check if this is a connection event - if so, skip guard (connection is handled in handleConnection)
    const handler = context.getHandler();
    const handlerName = handler?.name || 'unknown';
    if (handlerName === 'handleConnection' || handlerName === 'handleDisconnect') {
      // Guard should not run on connection/disconnect - these are handled in gateway
      this.logger.log(`[GUARD TRACE] [OP] Skipping guard for connection/disconnect: handler=${handlerName}`);
      return true;
    }
    
    const eventName = context.switchToWs().getData()?.event || handlerName;
    this.logger.log(`[GUARD TRACE] [OP] canActivate: socketId=${client.id}, event=${eventName}, handler=${handlerName}`);
    
    const devMode = this.config.get('OPERATOR_DEV_MODE') === 'true';
    const devToken = this.config.get('OPERATOR_DEV_TOKEN');
    const clientDevToken = client.handshake.headers['x-operator-dev-token'] as string;

    // DEV режим (только если включен)
    if (devMode && devToken && clientDevToken === devToken) {
      const channelId = client.handshake.query?.channelId || client.handshake.auth?.channelId;
      if (channelId && typeof channelId === 'string') {
        client.data.channelId = channelId;
        client.data.isDev = true;
        this.logger.log(`[OP_WS_TRACE] Guard: DEV mode enabled for socketId=${client.id}`);
        return true;
      }
    }

    // Real JWT auth
    const token = client.handshake.auth?.token || client.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      this.logger.warn(`[GUARD TRACE] [OP] Auth failed: no token, clientId=${client.id}, event=${eventName}`);
      // CRITICAL: Return false instead of throwing to avoid disconnect
      // Socket.IO will handle the rejection gracefully
      return false;
    }

    // Log token prefix (first 8 chars) for debugging
    const tokenPrefix = token.substring(0, 8);
    this.logger.log(`[OP_WS_TRACE] Guard auth attempt: clientId=${client.id}, event=${eventName}, tokenPrefix=${tokenPrefix}...`);

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('OPERATOR_JWT_SECRET') || this.config.get('JWT_SECRET') || 'dev-secret',
      });

      // Verify membership
      const membership = await this.prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId: payload.channelId,
            userId: payload.userId,
          },
        },
      });

      if (!membership) {
        this.logger.warn(`[GUARD TRACE] [OP] Auth failed: membership not found, clientId=${client.id}, event=${eventName}`);
        // CRITICAL: Return false instead of throwing to avoid disconnect
        return false;
      }

      client.data.userId = payload.userId;
      client.data.channelId = payload.channelId;
      client.data.role = payload.role;
      this.logger.log(`[GUARD TRACE] [OP] Auth success: clientId=${client.id}, event=${eventName}, userId=${payload.userId}, channelId=${payload.channelId?.substring(0, 8)}...`);
      return true;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[GUARD TRACE] [OP] Auth failed: clientId=${client.id}, event=${eventName}, error=${errorMessage}${errorStack ? `, stack=${errorStack.substring(0, 200)}` : ''}`);
      // CRITICAL: Return false instead of throwing to avoid disconnect
      return false;
    }
  }
}
