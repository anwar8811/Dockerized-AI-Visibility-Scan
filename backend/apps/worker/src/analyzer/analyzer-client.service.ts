import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface AnalyzeRequest {
  brand: string;
  competitors: string[];
  response: string;
}

interface AnalyzeResponse {
  brandMentioned: boolean;
  brandMentionCount: number;
  competitorsMentioned: string[];
  citationDomains: string[];
}

// EPIC-13 (KAD-26) - additive sibling of AnalyzeRequest/AnalyzeResponse
// above, which stay completely untouched. entities is every BrandProfile
// row for the scan (brand + every competitor), `{ id, name }` only - the
// analyzer echoes each id back in RankedEntity so the caller can match a
// ranking to its BrandProfile without re-matching by name string.
interface RankEntity {
  id: string;
  name: string;
}

interface AnalyzeRankRequest {
  response: string;
  entities: RankEntity[];
}

interface RankedEntity {
  entityId: string;
  mentionCount: number;
  rank: number;
}

interface AnalyzeRankResponse {
  rankings: RankedEntity[];
  citationDomains: string[];
}

@Injectable()
export class AnalyzerClientService {
  private readonly logger = new Logger('ANALYZER');

  constructor(private readonly httpService: HttpService) {}

  async analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    const baseUrl = process.env.ANALYZER_URL;

    // Wording matches the brief's §25 logging example exactly.
    this.logger.log('[ANALYZER] Sending response for analysis');

    const response = await firstValueFrom(
      this.httpService.post<AnalyzeResponse>(`${baseUrl}/analyze`, request),
    );

    this.logger.log('[ANALYZER] Analysis completed');

    return response.data;
  }

  // EPIC-13 (STORY-046) - calls the new POST /analyze/rank route
  // (STORY-044) instead of the classic /analyze above; used only by
  // PromptRankProcessor.
  async analyzeRank(request: AnalyzeRankRequest): Promise<AnalyzeRankResponse> {
    const baseUrl = process.env.ANALYZER_URL;

    this.logger.log('[ANALYZER] Sending response for rank analysis');

    const response = await firstValueFrom(
      this.httpService.post<AnalyzeRankResponse>(`${baseUrl}/analyze/rank`, request),
    );

    this.logger.log('[ANALYZER] Rank analysis completed');

    return response.data;
  }
}
