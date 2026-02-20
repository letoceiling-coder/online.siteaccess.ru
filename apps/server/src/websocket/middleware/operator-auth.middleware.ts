import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';

@Injectable()
export class OperatorAuthGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const devToken = this.config.get('OPERATOR_DEV_TOKEN');
    
    // РџСЂРѕРІРµСЂРєР° dev token РёР· auth РёР»Рё headers
    const clientToken = client.handshake.auth?.devToken || 
                       client.handshake.headers['x-operator-dev-token'] as string;

    // DEV СЂРµР¶РёРј
    if (devToken && clientToken === devToken) {
      const channelId = client.handshake.query?.channelId || client.handshake.auth?.channelId;
      if (channelId && typeof channelId === 'string') {
        client.data.channelId = channelId;
        client.data.isDev = true;
        return true;
      }
    }

    // TODO: РѕР±С‹С‡РЅС‹Р№ JWT РґР»СЏ РѕРїРµСЂР°С‚РѕСЂРѕРІ (РїРѕР·Р¶Рµ)
    throw new UnauthorizedException('Operator authentication required');
  }
}
