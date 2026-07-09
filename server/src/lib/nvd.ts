// NVD CVE lookup per docs/SPEC01.md §7. Unauthenticated NVD rate limits are low
// (~5 requests/30s), so every call goes through a shared throttle, and every
// successful response is cached by the caller (see routes/cve.ts) — this
// module only knows how to fetch and how to parse.

import { HttpError } from "./errors.js";

const NVD_BASE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const REQUEST_TIMEOUT_MS = 10_000;
// Unauthenticated: 5 requests/30s -> 1 per 6s. An API key raises this a lot
// (50/30s per NVD's docs); 600ms is a conservative floor either way.
const MIN_GAP_UNAUTHENTICATED_MS = 6_000;
const MIN_GAP_AUTHENTICATED_MS = 600;

let lastRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Test-only: the throttle's lastRequestAt is module-level state, which
// otherwise bleeds across unrelated test cases sharing this process.
export function __resetNvdThrottleForTests() {
  lastRequestAt = 0;
}

async function throttle(hasApiKey: boolean) {
  const minGap = hasApiKey ? MIN_GAP_AUTHENTICATED_MS : MIN_GAP_UNAUTHENTICATED_MS;
  const wait = lastRequestAt + minGap - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export const CVE_ID_PATTERN = /^CVE-\d{4}-\d{4,}$/i;

export async function fetchNvdCve(cveId: string, apiKey: string | undefined): Promise<unknown> {
  await throttle(Boolean(apiKey));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${NVD_BASE_URL}?cveId=${encodeURIComponent(cveId)}`, {
      signal: controller.signal,
      headers: apiKey ? { apiKey } : undefined,
    });
  } catch {
    throw new HttpError(502, "Couldn't reach NVD — paste the CVSS vector directly instead.");
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    throw new HttpError(404, `NVD has no record of ${cveId}.`);
  }
  if (!res.ok) {
    throw new HttpError(502, "Couldn't reach NVD — paste the CVSS vector directly instead.");
  }

  return res.json();
}

export interface NvdVectorOption {
  source: string;
  type: string;
  version: "4.0" | "3.1" | "3.0";
  vector: string;
  baseScore: number;
  baseSeverity: string;
}

interface NvdCvssEntry {
  source: string;
  type: string;
  cvssData: { version: string; vectorString: string; baseScore: number; baseSeverity?: string };
}

// NVD's v3+ CVSS metrics come tagged by major.minor version in separate
// arrays; v2 is deliberately ignored here since it's not a supported score.
export function extractVectorOptions(nvdJson: unknown): NvdVectorOption[] {
  const vuln = (nvdJson as { vulnerabilities?: { cve?: { metrics?: Record<string, NvdCvssEntry[]> } }[] })
    ?.vulnerabilities?.[0]?.cve?.metrics;
  if (!vuln) return [];

  const groups: { key: string; version: NvdVectorOption["version"] }[] = [
    { key: "cvssMetricV40", version: "4.0" },
    { key: "cvssMetricV31", version: "3.1" },
    { key: "cvssMetricV30", version: "3.0" },
  ];

  const options: NvdVectorOption[] = [];
  for (const { key, version } of groups) {
    for (const entry of vuln[key] ?? []) {
      options.push({
        source: entry.source,
        type: entry.type,
        version,
        vector: entry.cvssData.vectorString,
        baseScore: entry.cvssData.baseScore,
        baseSeverity: entry.cvssData.baseSeverity ?? "",
      });
    }
  }
  return options;
}

// Picks the option to use as the row's default: highest CVSS version first,
// "Primary" source before "Secondary" within the same version.
export function pickPrimaryVector(options: NvdVectorOption[]): NvdVectorOption | undefined {
  const versionRank: Record<NvdVectorOption["version"], number> = { "4.0": 2, "3.1": 1, "3.0": 0 };
  return [...options].sort((a, b) => {
    const versionDiff = versionRank[b.version] - versionRank[a.version];
    if (versionDiff !== 0) return versionDiff;
    return a.type === "Primary" ? -1 : b.type === "Primary" ? 1 : 0;
  })[0];
}
