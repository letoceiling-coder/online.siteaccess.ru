import { IsUUID, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CallIceDto {
  @IsUUID()
  callId: string;

  @IsUUID()
  conversationId: string;

  @IsUUID()
  channelId: string;

  @IsIn(['operator', 'visitor'])
  fromRole: 'operator' | 'visitor';

  @IsObject()
  candidate: RTCIceCandidateInit;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
