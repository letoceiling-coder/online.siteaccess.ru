import { Controller, Get, Post, Delete, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OperatorService } from './operator.service';
import { AddOperatorDto } from './dto/add-operator.dto';
import { OperatorLoginDto } from './dto/operator-login.dto';

@Controller('api/operator')
export class OperatorController {
  constructor(private operatorService: OperatorService) {}

  @Get('conversations')
  @UseGuards(AuthGuard('operator-jwt'))
  async getConversations(@Query('channelId') channelId: string, @Request() req: any) {
    // channelId from token should match query
    if (req.user.channelId !== channelId) {
      throw new Error('Channel ID mismatch');
    }
    return this.operatorService.getConversations(channelId);
  }

  @Get('messages')
  @UseGuards(AuthGuard('operator-jwt'))
  async getMessages(
    @Query('conversationId') conversationId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.operatorService.getMessages(conversationId, limit ? parseInt(limit) : 50);
  }
}

@Controller('api/operator/auth')
export class OperatorAuthController {
  constructor(private operatorService: OperatorService) {}

  @Post('login')
  async login(@Body() dto: OperatorLoginDto) {
    return this.operatorService.login(dto.email, dto.password, dto.channelId);
  }
}
