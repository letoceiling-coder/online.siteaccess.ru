import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class OperatorLoginDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  @IsUUID()
  channelId: string;
}
