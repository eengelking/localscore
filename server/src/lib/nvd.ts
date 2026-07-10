// NVD CVE lookup. Unauthenticated NVD rate limits are low
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
    throw new HttpError(502, "Couldn't reach NVD. Paste the CVSS vector directly instead.");
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    throw new HttpError(404, `NVD has no record of ${cveId}.`);
  }
  if (!res.ok) {
    throw new HttpError(502, "Couldn't reach NVD. Paste the CVSS vector directly instead.");
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

export interface CveReference {
  url: string;
  source?: string;
  tags?: string[];
}

export interface CveDetails {
  description: string | null;
  published: string | null;
  lastModified: string | null;
  references: CveReference[];
  affectedProducts: { items: string[]; moreCount: number };
}

const MAX_REFERENCES = 20;
const MAX_AFFECTED_PRODUCTS = 15;
const PATCH_LIKE_TAGS = new Set(["Patch", "Vendor Advisory"]);

interface NvdDescription {
  lang?: string;
  value?: string;
}

interface NvdReference {
  url?: string;
  source?: string;
  tags?: string[];
}

interface NvdCpeMatch {
  criteria?: string;
}

interface NvdConfigNode {
  cpeMatch?: NvdCpeMatch[];
}

interface NvdConfiguration {
  nodes?: NvdConfigNode[];
}

interface NvdCveDetail {
  descriptions?: NvdDescription[];
  published?: string;
  lastModified?: string;
  references?: NvdReference[];
  configurations?: NvdConfiguration[];
}

// Best-effort "vendor product" pair parsed from a cpe:2.3: URI, e.g.
// "cpe:2.3:a:google:chrome:*:*:*:*:*:*:*:*" -> "google chrome". Malformed
// or short criteria strings are skipped rather than throwing.
function vendorProductFromCpe(criteria: string): string | null {
  const parts = criteria.split(":");
  const vendor = parts[3];
  const product = parts[4];
  if (!vendor || !product || vendor === "*" || product === "*") return null;
  return `${vendor} ${product}`.replace(/_/g, " ");
}

// Extracts human-oriented CVE context (description, references, affected
// products) from an already-cached NVD payload, at read time. No migration:
// this is derived from the same `nvd_json` blob extractVectorOptions()
// already reads. Every field is optional/empty-tolerant since NVD payload
// shapes vary and older cached rows must not 500.
export function extractCveDetails(nvdJson: unknown): CveDetails {
  const cve = (nvdJson as { vulnerabilities?: { cve?: NvdCveDetail }[] })?.vulnerabilities?.[0]?.cve;
  if (!cve) {
    return { description: null, published: null, lastModified: null, references: [], affectedProducts: { items: [], moreCount: 0 } };
  }

  const descriptions = cve.descriptions ?? [];
  const description = descriptions.find((d) => d.lang === "en")?.value ?? descriptions[0]?.value ?? null;

  const references: CveReference[] = (cve.references ?? [])
    .filter((r): r is NvdReference & { url: string } => Boolean(r.url))
    .map((r) => ({ url: r.url, source: r.source, tags: r.tags }))
    .sort((a, b) => {
      const aPatch = (a.tags ?? []).some((t) => PATCH_LIKE_TAGS.has(t));
      const bPatch = (b.tags ?? []).some((t) => PATCH_LIKE_TAGS.has(t));
      if (aPatch === bPatch) return 0;
      return aPatch ? -1 : 1;
    })
    .slice(0, MAX_REFERENCES);

  const vendorProducts = new Set<string>();
  for (const config of cve.configurations ?? []) {
    for (const node of config.nodes ?? []) {
      for (const match of node.cpeMatch ?? []) {
        if (!match.criteria) continue;
        const pair = vendorProductFromCpe(match.criteria);
        if (pair) vendorProducts.add(pair);
      }
    }
  }
  const allProducts = [...vendorProducts];
  const affectedProducts = {
    items: allProducts.slice(0, MAX_AFFECTED_PRODUCTS),
    moreCount: Math.max(0, allProducts.length - MAX_AFFECTED_PRODUCTS),
  };

  return {
    description,
    published: cve.published ?? null,
    lastModified: cve.lastModified ?? null,
    references,
    affectedProducts,
  };
}

export interface MajorCveEntry {
  cveId: string;
  vector: string;
  version: NvdVectorOption["version"];
  baseScore: number;
  baseSeverity: string;
  published: string;
}

interface NvdCveListItem {
  cve: {
    id: string;
    published: string;
    metrics?: Record<string, NvdCvssEntry[]>;
  };
}

async function fetchNvdCveSearch(
  params: Record<string, string>,
  apiKey: string | undefined,
): Promise<NvdCveListItem[]> {
  await throttle(Boolean(apiKey));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const qs = new URLSearchParams(params);

  let res: Response;
  try {
    res = await fetch(`${NVD_BASE_URL}?${qs.toString()}`, {
      signal: controller.signal,
      headers: apiKey ? { apiKey } : undefined,
    });
  } catch {
    throw new HttpError(502, "Couldn't reach NVD.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new HttpError(502, "Couldn't reach NVD.");
  }

  const body = (await res.json()) as { vulnerabilities?: NvdCveListItem[] };
  return body.vulnerabilities ?? [];
}

// Top 10 most critical CVEs published in the last 30 days. NVD's search API
// doesn't support an OR across cvssV3Severity and cvssV4Severity, so this
// runs two separate queries over the same date window and merges/dedupes
// the results, preferring the v4.0 CVSS entry
// when a CVE has both (pickPrimaryVector already encodes that preference).
export async function fetchMajorCves(apiKey: string | undefined): Promise<MajorCveEntry[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const pubStartDate = start.toISOString();
  const pubEndDate = now.toISOString();

  const [v3Results, v4Results] = await Promise.all([
    fetchNvdCveSearch({ cvssV3Severity: "CRITICAL", pubStartDate, pubEndDate, resultsPerPage: "200" }, apiKey),
    fetchNvdCveSearch({ cvssV4Severity: "CRITICAL", pubStartDate, pubEndDate, resultsPerPage: "200" }, apiKey),
  ]);

  const byId = new Map<string, NvdCveListItem>();
  for (const item of [...v3Results, ...v4Results]) {
    byId.set(item.cve.id, item);
  }

  const entries: MajorCveEntry[] = [];
  for (const item of byId.values()) {
    const options: NvdVectorOption[] = [];
    const groups: { key: string; version: NvdVectorOption["version"] }[] = [
      { key: "cvssMetricV40", version: "4.0" },
      { key: "cvssMetricV31", version: "3.1" },
      { key: "cvssMetricV30", version: "3.0" },
    ];
    for (const { key, version } of groups) {
      for (const entry of item.cve.metrics?.[key] ?? []) {
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
    const primary = pickPrimaryVector(options);
    if (!primary) continue;
    entries.push({
      cveId: item.cve.id,
      vector: primary.vector,
      version: primary.version,
      baseScore: primary.baseScore,
      baseSeverity: primary.baseSeverity,
      published: item.cve.published,
    });
  }

  entries.sort((a, b) => b.baseScore - a.baseScore || b.published.localeCompare(a.published));
  return entries.slice(0, 10);
}
