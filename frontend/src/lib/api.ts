import type {
  ApiErrorBody,
  CreateAutoScanPayload,
  CreateAutoScanResponse,
  GeneratePromptsResponse,
  ScanDetailResponse,
  StartAnalysisResponse,
} from "./types";

// Inlined into the client bundle at build time (NEXT_PUBLIC_* convention) -
// see the Dockerfile, which passes this as a build ARG. Defaults to the
// backend's host-published port for plain `npm run dev` use outside Docker.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body: ApiErrorBody = await response.json().catch(() => ({
      statusCode: response.status,
      message: response.statusText,
      error: "Unknown",
    }));
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export function createAutoScan(
  payload: CreateAutoScanPayload,
): Promise<CreateAutoScanResponse> {
  return request<CreateAutoScanResponse>("/scans/auto", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getScan(scanId: string): Promise<ScanDetailResponse> {
  return request<ScanDetailResponse>(`/scans/${scanId}`);
}

export function generatePrompts(
  scanId: string,
): Promise<GeneratePromptsResponse> {
  return request<GeneratePromptsResponse>(`/scans/${scanId}/prompts`, {
    method: "POST",
  });
}

export function startAnalysis(
  scanId: string,
): Promise<StartAnalysisResponse> {
  return request<StartAnalysisResponse>(`/scans/${scanId}/analyze`, {
    method: "POST",
  });
}
