"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, generatePrompts, getScan, startAnalysis } from "@/lib/api";
import type { ScanDetailResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;

export default function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Dynamic route params are a Promise as of Next.js 15+ - `use()` is the
  // required way to read them from a Client Component (a Client Component
  // can't be `async`, unlike a Server Component page).
  const { id } = use(params);

  const [scan, setScan] = useState<ScanDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Only known right after clicking "Generate Prompts" in this session -
  // GET /scans/:id has no field for a Prompt's text before it has a
  // PromptResult (i.e. before ranking runs), so a page reload between
  // "prompts generated" and "analysis started" can't recover this text.
  const [generatedPrompts, setGeneratedPrompts] = useState<string[] | null>(
    null,
  );

  const fetchScan = useCallback(async () => {
    try {
      const data = await getScan(id);
      setScan(data);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        setNotFound(true);
      }
    }
  }, [id]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Kicked off via a timer (not called directly in the effect body) so
    // the initial fetch and every later poll go through the exact same
    // path - satisfies react-hooks/set-state-in-effect, which flags
    // setState reachable synchronously from an effect's own execution.
    const initial = setTimeout(fetchScan, 0);
    pollingRef.current = setInterval(fetchScan, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchScan]);

  useEffect(() => {
    if (scan?.status === "COMPLETED" && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [scan?.status]);

  async function handleGeneratePrompts() {
    setActionError(null);
    setActionLoading(true);
    try {
      const result = await generatePrompts(id);
      setGeneratedPrompts(result.prompts);
      await fetchScan();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to generate prompts.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStartAnalysis() {
    setActionError(null);
    setActionLoading(true);
    try {
      await startAnalysis(id);
      await fetchScan();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to start analysis.");
    } finally {
      setActionLoading(false);
    }
  }

  if (notFound) {
    return (
      <main className="page">
        <p className="error">Scan {id} not found.</p>
        <Link href="/">&larr; Start a new scan</Link>
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <Link href="/" className="back-link">
        &larr; Start a new scan
      </Link>
      <h1>{scan.brandName || scan.website}</h1>
      <p className="subtitle">{scan.website}</p>

      <div className="card">
        <div className="status-row">
          <span>Status</span>
          <span className={`badge badge-${scan.status.toLowerCase()}`}>
            {scan.status}
          </span>
        </div>

        {scan.brandProfiles.length > 0 && (
          <BrandProfilesTable brandProfiles={scan.brandProfiles} />
        )}

        {actionError && <p className="error">{actionError}</p>}

        {scan.status === "GATHERING_INTELLIGENCE" && (
          <p className="hint">
            Gathering intelligence for the brand and every competitor in the
            background — this page refreshes automatically.
          </p>
        )}

        {scan.status === "INTELLIGENCE_READY" && (
          <button
            className="button-primary"
            onClick={handleGeneratePrompts}
            disabled={actionLoading}
          >
            {actionLoading ? "Generating…" : "Generate 3 prompts"}
          </button>
        )}

        {scan.status === "PROMPTS_GENERATED" && (
          <>
            {generatedPrompts ? (
              <ol className="prompt-list">
                {generatedPrompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ol>
            ) : (
              <p className="hint">3 prompts were already generated for this scan.</p>
            )}
            <button
              className="button-primary"
              onClick={handleStartAnalysis}
              disabled={actionLoading}
            >
              {actionLoading ? "Starting…" : "Start ranked analysis"}
            </button>
          </>
        )}

        {scan.status === "PROCESSING" && (
          <p className="hint">
            Ranking {scan.processedPrompts}/{scan.totalPrompts} prompts
            against every competitor — this page refreshes automatically.
          </p>
        )}

        {scan.status === "COMPLETED" && <Results scan={scan} />}
      </div>
    </main>
  );
}

function BrandProfilesTable({
  brandProfiles,
}: {
  brandProfiles: ScanDetailResponse["brandProfiles"];
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Role</th>
          <th>Name</th>
          <th>Source</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {brandProfiles.map((profile) => (
          <tr key={profile.id}>
            <td>{profile.role}</td>
            <td>{profile.name ?? "—"}</td>
            <td>
              {profile.sourceUrl ? (
                <a href={profile.sourceUrl} target="_blank" rel="noreferrer">
                  {profile.sourceUrl}
                </a>
              ) : (
                "—"
              )}
            </td>
            <td>
              <span className={`badge badge-${profile.status.toLowerCase()}`}>
                {profile.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Results({ scan }: { scan: ScanDetailResponse }) {
  return (
    <div className="results">
      {scan.results.map((result) => (
        <div className="result-card" key={result.promptId}>
          <p className="result-prompt">{result.text}</p>
          <p className="result-answer">{result.aiResponse}</p>
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Entity</th>
                <th>Mentions</th>
              </tr>
            </thead>
            <tbody>
              {result.rankings.map((ranking) => (
                <tr key={ranking.entityName}>
                  <td>{ranking.rank}</td>
                  <td>{ranking.entityName}</td>
                  <td>{ranking.mentionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
