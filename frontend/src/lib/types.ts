// Mirrors backend/apps/api/src/scans/interfaces/scan-detail-response.interface.ts
// field-for-field. Hand-copied rather than imported, since frontend/backend
// are separate npm projects with no shared package (kept simple on purpose).

export type ScanStatus =
  | "GATHERING_INTELLIGENCE"
  | "INTELLIGENCE_READY"
  | "PROMPTS_GENERATED"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type BrandProfileRole = "BRAND" | "COMPETITOR";
export type BrandProfileStatus = "PENDING" | "COMPLETED" | "FAILED";

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

export interface PromptResultRankingSummary {
  entityName: string;
  mentionCount: number;
  rank: number;
}

export interface PromptResultSummary {
  promptId: string;
  text: string;
  status: ScanStatus;
  aiResponse: string;
  brandMentioned: boolean | null;
  brandMentionCount: number | null;
  competitorsMentioned: string[] | null;
  citationDomains: string[];
  rankings: PromptResultRankingSummary[];
}

export interface ScanDetailResponse {
  id: string;
  brandName: string;
  website: string;
  competitors: string[];
  status: ScanStatus;
  totalPrompts: number;
  processedPrompts: number;
  visibilityScore: number | null;
  competitorMentions: Record<string, number>;
  topCompetitor: string | null;
  citationDomains: string[];
  results: PromptResultSummary[];
  brandProfiles: BrandProfileSummary[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateAutoScanPayload {
  website: string;
  brandName?: string;
  competitors: string[];
}

export interface CreateAutoScanResponse {
  scanId: string;
  status: ScanStatus;
}

export interface GeneratePromptsResponse {
  scanId: string;
  prompts: string[];
}

export interface StartAnalysisResponse {
  scanId: string;
  status: ScanStatus;
}

// The shape of every error response, from HttpExceptionFilter (KAD-10) -
// same for validation failures, 404s, 409s, and 422s.
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}
