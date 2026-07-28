import { ScanPromptStatus } from '@app/common';

// The shape of GET /scans/:id's response - fixed now (STORY-007) so that
// STORY-018 (visibility scoring + scan completion) only ever has to
// populate real prompt_result data, never change this shape.
export interface PromptResultSummary {
  promptId: string;
  text: string;
  status: ScanPromptStatus;
  aiResponse: string;
  brandMentioned: boolean;
  brandMentionCount: number;
  competitorsMentioned: string[];
  citationDomains: string[];
}

export interface ScanDetailResponse {
  id: string;
  brandName: string;
  website: string;
  competitors: string[];
  status: ScanPromptStatus;
  totalPrompts: number;
  processedPrompts: number;
  visibilityScore: number | null;
  competitorMentions: Record<string, number>;
  topCompetitor: string | null;
  citationDomains: string[];
  results: PromptResultSummary[];
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
