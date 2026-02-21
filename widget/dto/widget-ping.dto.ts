import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class WidgetPingDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsOptional()
  externalId?: string;

  @IsString()
  @IsNotEmpty()
  pageUrl: string;
}
