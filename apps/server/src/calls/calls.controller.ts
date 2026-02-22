import { Controller, Get, UseGuards, Req, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CallsService } from './calls.service';
import { ConfigService } from '@nestjs/config';

@Controller('api/calls')
export class CallsController {
  private readonly logger = new Logger(CallsController.name);

  constructor(
    private callsService: CallsService,
    private config: ConfigService,
  ) {}

  @Get('ice')
  @UseGuards(AuthGuard(['jwt', 'operator-jwt']))
  async getIceServers(@Req() req: any) {
    // Get ICE servers from config
    const stunUrls = this.config.get('STUN_URLS') || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
    const turnUrl = this.config.get('TURN_URL');
    const turnUsername = this.config.get('TURN_USERNAME');
    const turnPassword = this.config.get('TURN_PASSWORD');

    const iceServers: RTCIceServer[] = [];

    // Add STUN servers
    const stunList = stunUrls.split(',').map((url: string) => url.trim());
    for (const stunUrl of stunList) {
      if (stunUrl) {
        iceServers.push({ urls: stunUrl });
      }
    }

    // Add TURN server if configured
    if (turnUrl && turnUsername && turnPassword) {
      iceServers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnPassword,
      });
    }

    // Log without secrets
    const userId = req.user?.id || req.user?.userId || 'unknown';
    this.logger.log(`ICE servers requested by user ${userId}, returning ${iceServers.length} servers`);

    return { iceServers };
  }
}
