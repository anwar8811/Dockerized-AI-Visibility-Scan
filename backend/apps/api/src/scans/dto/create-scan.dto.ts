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
    example: 'Elegant',
  })
  @IsString()
  @IsNotEmpty()
  brandName: string;

  @ApiProperty({
    description: "The brand's website - must be a valid URL.",
    example: 'https://eleganttechbd.com',
  })
  @IsUrl()
  website: string;

  @ApiProperty({
    description: 'Competitor brand names. Minimum 1, maximum 3.',
    example: ['PixelForge Studio', 'CodeCraft Labs'],
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
      'What is the best product studio for building an AI-native MVP quickly?',
      'Which full-stack team can take a startup idea to a launched product in a few weeks?',
      'What product development studio offers strategy, UX design, engineering, and AI together?',
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
