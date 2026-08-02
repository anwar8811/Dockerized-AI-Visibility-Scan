import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AutoScansService } from './auto-scans.service';
import { CreateAutoScanDto } from './dto/create-auto-scan.dto';

// A deliberately separate controller/route from ScansController - POST
// /scans itself is never touched by this endpoint (KAD-13). EPIC-13
// (KAD-21): this is now stage 1 of a 3-stage flow - it only kicks off
// intelligence gathering; POST /scans/:id/prompts and
// POST /scans/:id/analyze (STORY-043/STORY-045) are the follow-up stages.
@ApiTags('scans')
@Controller('scans/auto')
export class AutoScansController {
  constructor(private readonly autoScansService: AutoScansService) {}

  @Post()
  @ApiOperation({
    summary: 'Start gathering brand + competitor intelligence for a new scan',
    description:
      'Creates a Scan and one BrandProfile row per entity (the brand, plus each competitor), then enqueues one background job per entity to gather its intelligence in parallel. Returns immediately - no crawl or AI call happens in this request. Poll GET /scans/:id until status is "INTELLIGENCE_READY", then call POST /scans/:id/prompts.',
  })
  @ApiResponse({
    status: 201,
    description: 'Scan created; intelligence gathering started in the background.',
    schema: { example: { scanId: 'uuid', status: 'GATHERING_INTELLIGENCE' } },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (see CreateAutoScanDto).',
    schema: {
      example: {
        statusCode: 400,
        message: ['website must be a URL address'],
        error: 'Bad Request',
      },
    },
  })
  create(@Body() dto: CreateAutoScanDto) {
    return this.autoScansService.create(dto);
  }
}
