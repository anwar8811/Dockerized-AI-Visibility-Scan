import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AutoScansService } from './auto-scans.service';
import { CreateAutoScanDto } from './dto/create-auto-scan.dto';

// A deliberately separate controller/route from ScansController - POST
// /scans itself is never touched by this endpoint (KAD-13).
@ApiTags('scans')
@Controller('scans/auto')
export class AutoScansController {
  constructor(private readonly autoScansService: AutoScansService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a scan with auto-detected brand name and/or auto-generated prompts',
    description:
      'brandName and prompts are both optional - whichever is omitted is resolved by crawling the website (at most once), then the scan is created exactly like POST /scans would with the resolved values.',
  })
  @ApiResponse({
    status: 201,
    description: 'Scan created and queued.',
    schema: { example: { scanId: 'uuid', status: 'QUEUED' } },
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
  @ApiResponse({
    status: 422,
    description:
      'The website could not be crawled, or (when prompts was omitted) AI prompt generation failed.',
    schema: {
      example: {
        statusCode: 422,
        message: 'Unable to extract sufficient brand information from the website.',
        error: 'Unprocessable Entity',
      },
    },
  })
  create(@Body() dto: CreateAutoScanDto) {
    return this.autoScansService.create(dto);
  }
}
