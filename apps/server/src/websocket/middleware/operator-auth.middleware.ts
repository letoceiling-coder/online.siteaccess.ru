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
    const devMode = this.config.get('OPERATOR_DEV_MODE') === 'true';
    const devToken = this.config.get('OPERATOR_DEV_TOKEN');
    const clientDevToken = client.handshake.headers['x-operator-dev-token'] as string;

    // DEV режим (только если включен)
    if (devMode && devToken && clientDevToken === devToken) {
      const channelId = client.handshake.query?.channelId || client.handshake.auth?.channelId;
      if (channelId && typeof channelId === 'string') {
        client.data.channelId = channelId;
        client.data.isDev = true;
        return true;
      }
    }

    // Real JWT auth
    const token = client.handshake.auth?.token || client.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      this.logger.warn(`[TRACE_WS] Operator auth failed: no token, clientId=${client.id}`);
      throw new UnauthorizedException('Token required');
    }

    // Log token prefix (first 12 chars) for debugging
    const tokenPrefix = token.substring(0, 12);
    this.logger.log(`[TRACE_WS] Operator auth attempt: clientId=${client.id}, tokenPrefix=${tokenPrefix}...`);

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
        throw new UnauthorizedException('Membership not found');
      }

      client.data.userId = payload.userId;
      client.data.channelId = payload.channelId;
      client.data.role = payload.role;
      this.logger.log(`[TRACE_WS] Operator auth success: clientId=${client.id}, userId=${payload.userId}, channelId=${payload.channelId}`);
      return true;
    } catch (error: any) {
      this.logger.warn(`[TRACE_WS] Operator auth failed: clientId=${client.id}, error=${error.message || 'unknown'}`);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
