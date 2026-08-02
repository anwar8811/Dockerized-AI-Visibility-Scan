import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScanPromptsService } from './scan-prompts.service';

// EPIC-13's stage 2 endpoint - POST /scans/:id/prompts, callable only
// once POST /scans/auto's intelligence-gathering has finished.
@ApiTags('scans')
@Controller('scans/:id/prompts')
export class ScanPromptsController {
  constructor(private readonly scanPromptsService: ScanPromptsService) {}

  @Post()
  @ApiOperation({
    summary: 'Generate exactly 3 brand-neutral prompts from a scan\'s gathered intelligence',
    description:
      'Callable only once GET /scans/:id shows status "INTELLIGENCE_READY". Generates exactly 3 buyer-intent prompts from the brand\'s gathered BrandProfile - never naming the brand - persists them as Prompt rows, and sets status to "PROMPTS_GENERATED".',
  })
  @ApiParam({ name: 'id', description: 'Scan UUID', example: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Exactly 3 prompts generated and persisted.',
    schema: { example: { scanId: 'uuid', prompts: ['prompt one', 'prompt two', 'prompt three'] } },
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
    description: 'Scan is not yet ready (intelligence gathering still in progress), or prompts were already generated.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Scan <id> is not ready for prompt generation (current status: GATHERING_INTELLIGENCE)',
        error: 'Conflict',
      },
    },
  })
  @ApiResponse({
    status: 422,
    description: 'AI prompt generation failed, or the brand\'s own intelligence gathering did not complete.',
    schema: {
      example: {
        statusCode: 422,
        message: 'Unable to generate prompts from the gathered brand intelligence.',
        error: 'Unprocessable Entity',
      },
    },
  })
  create(@Param('id', ParseUUIDPipe) id: string) {
    return this.scanPromptsService.create(id);
  }
}
