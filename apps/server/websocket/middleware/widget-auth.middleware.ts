import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WidgetAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake.auth?.token || client.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Token required');
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.channelId = payload.channelId;
      client.data.visitorId = payload.visitorId;
      client.data.conversationId = payload.conversationId;
      client.data.externalId = payload.externalId;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
