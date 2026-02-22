import { IsString, IsUUID, IsIn, IsOptional } from 'class-validator';

export class CallAnswerDto {
  @IsUUID()
  callId: string;

  @IsUUID()
  conversationId: string;

  @IsUUID()
  channelId: string;

  @IsIn(['operator', 'visitor'])
  fromRole: 'operator' | 'visitor';

  @IsString()
  sdp: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
