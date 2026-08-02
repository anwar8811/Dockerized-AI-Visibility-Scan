import { ScanPromptStatus, BrandProfileRole, BrandProfileStatus } from '@app/common';

// One entry per PromptResultRanking row for a PromptResult (EPIC-13,
// STORY-047) - [] for classic POST /scans rows, which have no ranking
// rows at all.
export interface PromptResultRankingSummary {
  entityName: string;
  mentionCount: number;
  rank: number;
}

// The shape of GET /scans/:id's response - fixed now (STORY-007) so that
// STORY-018 (visibility scoring + scan completion) only ever has to
// populate real prompt_result data, never change this shape.
export interface PromptResultSummary {
  promptId: string;
  text: string;
  status: ScanPromptStatus;
  aiResponse: string;
  // Nullable since EPIC-13 (KAD-27) - null for a PromptResult created by
  // the new ranked-analysis flow, which never populates these three
  // fields. Always non-null for the classic POST /scans pipeline.
  brandMentioned: boolean | null;
  brandMentionCount: number | null;
  competitorsMentioned: string[] | null;
  citationDomains: string[];
  rankings: PromptResultRankingSummary[];
}

// One entry per BrandProfile row for the scan (EPIC-13, STORY-047) - []
// for every scan created via the classic POST /scans, which never
// creates BrandProfile rows.
export interface BrandProfileSummary {
  id: string;
  role: BrandProfileRole;
  name: string | null;
  sourceUrl: string | null;
  servicesOffered: string | null;
  metaDescription: string | null;
  summary: string | null;
  pros: string[];
  cons: string[];
  status: BrandProfileStatus;
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
  brandProfiles: BrandProfileSummary[];
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
