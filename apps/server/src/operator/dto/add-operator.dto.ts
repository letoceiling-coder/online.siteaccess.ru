import { IsEmail, IsString, IsOptional } from 'class-validator';

export class AddOperatorDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  password?: string;
}
