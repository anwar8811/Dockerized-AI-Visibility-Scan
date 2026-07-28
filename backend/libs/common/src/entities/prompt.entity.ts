import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ScanPromptStatus } from '../enums/scan-prompt-status.enum';
import { Scan } from './scan.entity';

@Entity('prompt')
export class Prompt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Indexed: every GET /scans/:id and every "is this scan fully
  // processed" check queries prompts by their parent scan (schemas/prompt.md).
  // A foreign key does NOT get an index automatically in Postgres/TypeORM -
  // this has to be added explicitly.
  @Index()
  @Column({ type: 'uuid' })
  scanId: string;

  @ManyToOne(() => Scan, (scan) => scan.prompts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scanId' })
  scan: Scan;

  @Column({ type: 'text' })
  text: string;

  @Column({
    type: 'enum',
    enum: ScanPromptStatus,
    // Same shared Postgres enum type as Scan.status - see scan.entity.ts.
    enumName: 'scan_prompt_status',
    default: ScanPromptStatus.QUEUED,
  })
  status: ScanPromptStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // The `result` relation (OneToOne -> PromptResult) is added in
  // STORY-005, once the PromptResult entity exists.
}
