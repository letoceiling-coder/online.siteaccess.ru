import { Controller, Get, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { OperatorService } from './operator.service';
import { ConfigService } from '@nestjs/config';

@Controller('api/operator/dev')
export class OperatorController {
  constructor(
    private operatorService: OperatorService,
    private config: ConfigService,
  ) {}

  private checkDevToken(token?: string): void {
    const devToken = this.config.get('OPERATOR_DEV_TOKEN');
    if (!devToken || token !== devToken) {
      throw new UnauthorizedException('Invalid dev token');
    }
  }

  @Get('conversations')
  async getConversations(
    @Query('channelId') channelId: string,
    @Headers('x-operator-dev-token') token?: string,
  ) {
    this.checkDevToken(token);
    return this.operatorService.getConversations(channelId);
  }

  @Get('messages')
  async getMessages(
    @Query('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Headers('x-operator-dev-token') token?: string,
  ) {
    this.checkDevToken(token);
    return this.operatorService.getMessages(conversationId, limit ? parseInt(limit) : 50);
  }
}
