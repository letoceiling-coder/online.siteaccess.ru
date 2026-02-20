import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name: string;
}
