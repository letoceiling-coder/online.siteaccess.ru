import { IsUUID, IsIn, IsOptional, IsString } from 'class-validator';

export class CallHangupDto {
  @IsUUID()
  callId: string;

  @IsUUID()
  conversationId: string;

  @IsUUID()
  channelId: string;

  @IsIn(['operator', 'visitor'])
  fromRole: 'operator' | 'visitor';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
