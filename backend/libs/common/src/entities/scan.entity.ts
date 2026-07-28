import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ScanPromptStatus } from '../enums/scan-prompt-status.enum';

@Entity('scan')
export class Scan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  brandName: string;

  @Column({ type: 'varchar' })
  website: string;

  @Column({ type: 'text', array: true })
  competitors: string[];

  @Column({
    type: 'enum',
    enum: ScanPromptStatus,
    // Shared Postgres enum type name - Prompt.status (STORY-004) reuses
    // this exact enumName so both columns point at ONE Postgres enum
    // type instead of two separate near-duplicate types.
    enumName: 'scan_prompt_status',
    default: ScanPromptStatus.QUEUED,
  })
  status: ScanPromptStatus;

  @Column({ type: 'int' })
  totalPrompts: number;

  @Column({ type: 'int', default: 0 })
  processedPrompts: number;

  @Column({ type: 'int', nullable: true })
  visibilityScore: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  // The `prompts` relation (OneToMany -> Prompt) is added in STORY-004,
  // once the Prompt entity exists - TypeORM relations are declared on
  // both sides, so that story touches this file too.
}
