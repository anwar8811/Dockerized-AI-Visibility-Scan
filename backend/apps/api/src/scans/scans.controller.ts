import { Body, Controller, Post } from '@nestjs/common';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/create-scan.dto';

@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post()
  create(@Body() dto: CreateScanDto) {
    return this.scansService.create(dto);
  }
}
