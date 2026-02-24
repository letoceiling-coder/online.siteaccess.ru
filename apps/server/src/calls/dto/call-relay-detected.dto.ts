import { IsString, IsBoolean, IsNotEmpty } from 'class-validator';

export class CallRelayDetectedDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  channelId: string;

  @IsBoolean()
  usedRelay: boolean;

  @IsString()
  fromRole: 'operator' | 'visitor';
}
