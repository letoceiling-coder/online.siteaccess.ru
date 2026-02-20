import { IsArray, IsString } from 'class-validator';

export class UpdateDomainsDto {
  @IsArray()
  @IsString({ each: true })
  domains: string[];
}
