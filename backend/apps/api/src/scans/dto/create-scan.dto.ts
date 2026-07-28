import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsUrl,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class CreateScanDto {
  @IsString()
  @IsNotEmpty()
  brandName: string;

  @IsUrl()
  website: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  competitors: string[];

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  prompts: string[];
}
