import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class UpdateDomainsDto {
  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  domains: string[];
}
