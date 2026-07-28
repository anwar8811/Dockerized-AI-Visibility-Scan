import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/create-scan.dto';

@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post()
  create(@Body() dto: CreateScanDto) {
    return this.scansService.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const scan = await this.scansService.getScanWithAggregates(id);
    if (!scan) {
      throw new NotFoundException(`Scan ${id} not found`);
    }
    return scan;
  }
}
