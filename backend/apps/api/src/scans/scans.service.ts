import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Scan, Prompt } from '@app/common';
import { CreateScanDto } from './dto/create-scan.dto';

@Injectable()
export class ScansService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(dto: CreateScanDto): Promise<{ scanId: string; status: string }> {
    // One Scan row + one Prompt row per submitted prompt, in a single
    // transaction - a partial write (scan created but a prompt insert
    // failing) can never happen.
    return this.dataSource.transaction(async (manager) => {
      const scan = manager.create(Scan, {
        brandName: dto.brandName,
        website: dto.website,
        competitors: dto.competitors,
        totalPrompts: dto.prompts.length,
      });
      await manager.save(scan);

      const prompts = dto.prompts.map((text) =>
        manager.create(Prompt, { scanId: scan.id, text }),
      );
      await manager.save(prompts);

      // No BullMQ job is enqueued here - that is deliberately deferred to
      // STORY-009, so this story is reviewable purely as "can I create a
      // scan," independent of the queue.
      return { scanId: scan.id, status: scan.status };
    });
  }
}
