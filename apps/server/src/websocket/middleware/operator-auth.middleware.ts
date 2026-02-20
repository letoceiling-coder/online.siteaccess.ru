import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OperatorAuthGuard implements CanActivate {
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
      throw new UnauthorizedException('Token required');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('OPERATOR_JWT_SECRET') || this.config.get('JWT_SECRET') || 'dev-secret',
      });

      // Verify membership
      const membership = await (this.prisma as any).channelMember.findUnique({
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
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
