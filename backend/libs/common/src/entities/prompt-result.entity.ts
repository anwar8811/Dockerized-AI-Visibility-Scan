import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Prompt } from './prompt.entity';
import { PromptResultRanking } from './prompt-result-ranking.entity';

@Entity('prompt_result')
export class PromptResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  promptId: string;

  // TypeORM adds a UNIQUE constraint on the join column automatically
  // for a @OneToOne relation - this (not a second, explicit `unique: true`
  // on the column above, which would just duplicate the same constraint)
  // is what makes "no duplicate PromptResult on retry" (NFR4) a
  // database-level guarantee rather than just an application-level promise.
  @OneToOne(() => Prompt, (prompt) => prompt.result, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promptId' })
  prompt: Prompt;

  @Column({ type: 'text' })
  aiResponse: string;

  // Nullable since EPIC-13 (KAD-27) - NULL for PromptResult rows created by
  // the new ranked-analysis flow (POST /scans/:id/analyze), which uses the
  // related PromptResultRanking rows instead. The classic POST /scans
  // pipeline still always assigns real values here, never null.
  @Column({ type: 'boolean', nullable: true })
  brandMentioned: boolean | null;

  @Column({ type: 'int', nullable: true })
  brandMentionCount: number | null;

  @Column({ type: 'text', array: true, nullable: true })
  competitorsMentioned: string[] | null;

  @Column({ type: 'text', array: true, default: '{}' })
  citationDomains: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // EPIC-13 (STORY-047) - reverse side of PromptResultRanking.promptResult,
  // one row per entity (brand + every competitor) for rows created by the
  // new ranked-analysis flow. Empty for every classic POST /scans row,
  // which never has PromptResultRanking rows at all.
  @OneToMany(() => PromptResultRanking, (ranking) => ranking.promptResult)
  rankings: PromptResultRanking[];
}
