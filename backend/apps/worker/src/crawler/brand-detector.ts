import * as cheerio from 'cheerio';
import { CrawledPage } from '@app/common';

// Pure function (no NestJS DI, same style as libs/common/src/scoring/
// visibility-scoring.ts) - given the crawled homepage, tries each detection
// method in priority order (brief's requirements doc order, KAD-16):
// og:site_name -> JSON-LD Organization.name -> <title> -> <h1> -> domain
// name (guaranteed final fallback - this function never throws/returns
// nothing for lack of a "good" signal).
//
// Relocated from apps/api/src/crawler/ to apps/worker/src/crawler/ during
// STORY-041 - only apps/worker's BrandIntelligenceProcessor calls this now.
export function detectBrandName(homepage: CrawledPage): string {
  const $ = cheerio.load(homepage.html);

  const ogSiteName = $('meta[property="og:site_name"]').attr('content')?.trim();
  if (ogSiteName) {
    return ogSiteName;
  }

  const jsonLdName = findOrganizationNameInJsonLd($);
  if (jsonLdName) {
    return jsonLdName;
  }

  const title = $('title').first().text().trim();
  if (title) {
    return title;
  }

  const h1 = $('h1').first().text().trim();
  if (h1) {
    return h1;
  }

  return deriveNameFromDomain(homepage.url);
}

function findOrganizationNameInJsonLd($: cheerio.CheerioAPI): string | null {
  const scripts = $('script[type="application/ld+json"]').toArray();

  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(script).text());
    } catch {
      // Not valid JSON - this script block just doesn't count, not an error.
      continue;
    }

    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      const name = extractOrganizationName(candidate);
      if (name) {
        return name;
      }
    }
  }

  return null;
}

function extractOrganizationName(node: unknown): string | null {
  if (!node || typeof node !== 'object') {
    return null;
  }
  const obj = node as Record<string, unknown>;

  if (isOrganizationType(obj['@type']) && typeof obj.name === 'string' && obj.name.trim()) {
    return obj.name.trim();
  }

  const graph = obj['@graph'];
  if (Array.isArray(graph)) {
    for (const entry of graph) {
      const name = extractOrganizationName(entry);
      if (name) {
        return name;
      }
    }
  }

  return null;
}

function isOrganizationType(type: unknown): boolean {
  if (typeof type === 'string') {
    return type === 'Organization';
  }
  if (Array.isArray(type)) {
    return type.includes('Organization');
  }
  return false;
}

// Best-effort only - a naive domain slug does not reliably reproduce a
// brand's real stylized casing (nimbuscrm.com -> "Nimbuscrm", not
// "NimbusCRM"). Documented, accepted limitation (KAD-16), not engineered
// further here.
function deriveNameFromDomain(url: string): string {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const label = hostname.split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}
