import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsUrl,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateScanDto {
  @ApiProperty({
    description: 'The target brand being scanned for AI visibility.',
    example: 'NimbusCRM',
  })
  @IsString()
  @IsNotEmpty()
  brandName: string;

  @ApiProperty({
    description: "The brand's website - must be a valid URL.",
    example: 'https://nimbuscrm.test',
  })
  @IsUrl()
  website: string;

  @ApiProperty({
    description: 'Competitor brand names. Minimum 1, maximum 3.',
    example: ['OrbitDesk', 'ClientLoop'],
    minItems: 1,
    maxItems: 3,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  competitors: string[];

  @ApiProperty({
    description: 'AI search prompts to test. Minimum 3, maximum 5.',
    example: [
      'What are the best CRM tools for small agencies?',
      'What CRM is good for managing client follow-ups?',
      'What are good lightweight CRM tools for small teams?',
    ],
    minItems: 3,
    maxItems: 5,
  })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  prompts: string[];
}
