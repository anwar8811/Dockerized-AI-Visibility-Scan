import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Prompt } from './prompt.entity';

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

  @Column({ type: 'boolean' })
  brandMentioned: boolean;

  @Column({ type: 'int' })
  brandMentionCount: number;

  @Column({ type: 'text', array: true, default: '{}' })
  competitorsMentioned: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  citationDomains: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
