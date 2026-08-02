import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BrandProfileRole } from '../enums/brand-profile-role.enum';
import { BrandProfileStatus } from '../enums/brand-profile-status.enum';
import { Scan } from './scan.entity';

// One row per entity (the brand itself, plus each competitor) per scan
// (EPIC-13, KAD-22) - gathered in parallel as one independent BullMQ job
// per row (KAD-23), so rows for the same scan reach a terminal status at
// different times, independently.
@Entity('brand_profile')
@Index(['scanId', 'status'])
export class BrandProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Indexed: every GET /scans/:id and the atomic "are all entities
  // terminal yet" completion check filter on this column - a foreign key
  // does NOT get an index automatically in Postgres/TypeORM (same note
  // as prompt.entity.ts's scanId).
  @Index()
  @Column({ type: 'uuid' })
  scanId: string;

  @ManyToOne(() => Scan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scanId' })
  scan: Scan;

  @Column({ type: 'enum', enum: BrandProfileRole, enumName: 'brand_profile_role' })
  role: BrandProfileRole;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'text', nullable: true })
  servicesOffered: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  pros: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  cons: string[];

  @Column({
    type: 'enum',
    enum: BrandProfileStatus,
    enumName: 'brand_profile_status',
    default: BrandProfileStatus.PENDING,
  })
  status: BrandProfileStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
