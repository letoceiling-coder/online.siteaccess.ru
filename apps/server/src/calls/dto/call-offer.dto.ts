import { IsString, IsUUID, IsIn, IsOptional } from 'class-validator';

export class CallOfferDto {
  @IsUUID()
  callId: string;

  @IsUUID()
  conversationId: string;

  @IsUUID()
  channelId: string;

  @IsIn(['operator', 'visitor'])
  fromRole: 'operator' | 'visitor';

  @IsIn(['audio', 'video'])
  kind: 'audio' | 'video';

  @IsString()
  sdp: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
