import { IsString, IsNotEmpty, IsArray, IsOptional, IsString as IsStringArray } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  domains?: string[];
}
