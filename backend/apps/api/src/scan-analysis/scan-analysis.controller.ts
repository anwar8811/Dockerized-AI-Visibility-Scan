import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScanAnalysisService } from './scan-analysis.service';

// EPIC-13's stage 3 trigger endpoint - POST /scans/:id/analyze, callable
// only once POST /scans/:id/prompts (STORY-043) has generated the 3
// brand-neutral prompts.
@ApiTags('scans')
@Controller('scans/:id/analyze')
export class ScanAnalysisController {
  constructor(private readonly scanAnalysisService: ScanAnalysisService) {}

  @Post()
  @ApiOperation({
    summary: 'Start ranked analysis for a scan\'s 3 generated prompts',
    description:
      'Callable only once GET /scans/:id shows status "PROMPTS_GENERATED". Enqueues one background job per prompt to get an AI response and rank the brand against its competitors, then returns immediately.',
  })
  @ApiParam({ name: 'id', description: 'Scan UUID', example: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Analysis started in the background.',
    schema: { example: { scanId: 'uuid', status: 'PROCESSING' } },
  })
  @ApiResponse({
    status: 404,
    description: 'Scan does not exist.',
    schema: {
      example: { statusCode: 404, message: 'Scan <id> not found', error: 'Not Found' },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Scan is not yet ready (prompts not generated yet), or analysis was already started.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Scan <id> is not ready for analysis (current status: INTELLIGENCE_READY)',
        error: 'Conflict',
      },
    },
  })
  create(@Param('id', ParseUUIDPipe) id: string) {
    return this.scanAnalysisService.create(id);
  }
}
