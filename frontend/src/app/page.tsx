"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createAutoScan } from "@/lib/api";

const MAX_COMPETITORS = 3;

export default function HomePage() {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const [brandName, setBrandName] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateCompetitor(index: number, value: string) {
    setCompetitors((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  function addCompetitor() {
    setCompetitors((prev) =>
      prev.length < MAX_COMPETITORS ? [...prev, ""] : prev,
    );
  }

  function removeCompetitor(index: number) {
    setCompetitors((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const cleanedCompetitors = competitors
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cleanedCompetitors.length === 0) {
      setError("Enter at least 1 competitor name.");
      return;
    }

    setSubmitting(true);
    try {
      const { scanId } = await createAutoScan({
        website: website.trim(),
        brandName: brandName.trim() || undefined,
        competitors: cleanedCompetitors,
      });
      router.push(`/scans/${scanId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>AI Visibility Scan</h1>
      <p className="subtitle">
        Give a real website and 1–3 competitor names. This gathers brand +
        competitor intelligence, generates 3 brand-neutral prompts, then
        ranks an AI&apos;s answer against every competitor.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <label className="field">
          <span>Website</span>
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>

        <label className="field">
          <span>
            Brand name (optional — detected from the website if omitted)
          </span>
          <input
            type="text"
            placeholder="Acme Inc"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
          />
        </label>

        <div className="field">
          <span>Competitors (1–3 names)</span>
          {competitors.map((competitor, index) => (
            <div className="competitor-row" key={index}>
              <input
                type="text"
                placeholder={`Competitor ${index + 1}`}
                value={competitor}
                onChange={(e) => updateCompetitor(index, e.target.value)}
              />
              {competitors.length > 1 && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => removeCompetitor(index)}
                  aria-label={`Remove competitor ${index + 1}`}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          {competitors.length < MAX_COMPETITORS && (
            <button
              type="button"
              className="button-secondary"
              onClick={addCompetitor}
            >
              + Add competitor
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Starting…" : "Start scan"}
        </button>
      </form>
    </main>
  );
}
