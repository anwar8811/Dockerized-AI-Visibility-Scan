import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/create-scan.dto';

@ApiTags('scans')
@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a scan',
    description:
      'Creates a Scan and one Prompt per submitted prompt string, and returns immediately - no AI/analyzer processing happens in this request.',
  })
  @ApiResponse({
    status: 201,
    description: 'Scan created and queued.',
    schema: { example: { scanId: 'uuid', status: 'QUEUED' } },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (see the Validation Rules table).',
    schema: {
      example: {
        statusCode: 400,
        message: ['website must be a URL address'],
        error: 'Bad Request',
      },
    },
  })
  create(@Body() dto: CreateScanDto) {
    return this.scansService.create(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a scan by id',
    description:
      'Returns the complete current state of a scan, including computed visibility/competitor/citation aggregates and per-prompt results.',
  })
  @ApiParam({ name: 'id', description: 'Scan UUID', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Full scan state.',
    schema: {
      example: {
        id: 'uuid',
        brandName: 'NimbusCRM',
        website: 'https://nimbuscrm.test',
        competitors: ['OrbitDesk', 'ClientLoop'],
        status: 'COMPLETED',
        totalPrompts: 5,
        processedPrompts: 5,
        visibilityScore: 60,
        competitorMentions: { OrbitDesk: 3, ClientLoop: 2 },
        topCompetitor: 'OrbitDesk',
        citationDomains: ['reviews.test', 'comparison.test'],
        results: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:05.000Z',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Scan does not exist.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Scan <id> not found',
        error: 'Not Found',
      },
    },
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const scan = await this.scansService.getScanWithAggregates(id);
    if (!scan) {
      throw new NotFoundException(`Scan ${id} not found`);
    }
    return scan;
  }
}
