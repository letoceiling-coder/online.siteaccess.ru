import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class WidgetSessionDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsOptional()
  externalId?: string;
}
