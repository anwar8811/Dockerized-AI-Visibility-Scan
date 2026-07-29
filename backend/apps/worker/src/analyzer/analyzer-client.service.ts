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
}
