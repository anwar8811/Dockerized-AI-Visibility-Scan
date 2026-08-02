import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PromptResult } from './prompt-result.entity';
import { BrandProfile } from './brand-profile.entity';

// One row per entity (brand or competitor) per prompt_result - the Rust
// analyzer's POST /analyze/rank output (EPIC-13, KAD-28), for the new
// ranked-analysis flow only. A proper relational child table, not a JSON
// column, so each row can reference its BrandProfile directly.
@Entity('prompt_result_ranking')
@Index(['promptResultId', 'brandProfileId'], { unique: true })
export class PromptResultRanking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  promptResultId: string;

  @ManyToOne(() => PromptResult, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promptResultId' })
  promptResult: PromptResult;

  @Column({ type: 'uuid' })
  brandProfileId: string;

  @ManyToOne(() => BrandProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brandProfileId' })
  brandProfile: BrandProfile;

  @Column({ type: 'int' })
  mentionCount: number;

  @Column({ type: 'int' })
  rank: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
