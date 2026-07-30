import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
      'Crawls the website only for whatever of brandName/prompts is missing, then creates the scan exactly like POST /scans would with the resolved values.',
  })
  create(@Body() dto: CreateAutoScanDto) {
    return this.autoScansService.create(dto);
  }
}
