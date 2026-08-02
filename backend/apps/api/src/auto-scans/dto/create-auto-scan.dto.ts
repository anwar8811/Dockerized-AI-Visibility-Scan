import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// A deliberately separate class from CreateScanDto (apps/api/src/scans/dto/
// create-scan.dto.ts) - POST /scans and its DTO are never touched by this
// endpoint (KAD-13). The overlap between the two DTOs' fields is accepted
// duplication in exchange for that isolation guarantee.
export class CreateAutoScanDto {
  @ApiProperty({
    description: "The brand's website - must be a valid URL. Always required.",
    example: 'https://eleganttechbd.com',
  })
  @IsUrl()
  website: string;

  @ApiProperty({
    description:
      'The target brand being scanned for AI visibility. Optional - when omitted, it is detected by crawling the website (see FR13.2).',
    example: 'Elegant',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  brandName?: string;

  @ApiProperty({
    description: 'Competitor brand names. Minimum 1, maximum 3. Always required.',
    example: ['PixelForge Studio', 'CodeCraft Labs'],
    minItems: 1,
    maxItems: 3,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  competitors: string[];
}
