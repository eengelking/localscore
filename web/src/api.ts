import type {
  Answer,
  ApiError,
  Catalog,
  CveResponse,
  Environment,
  EnvironmentDetail,
  MajorCvesResponse,
  SavedVulnerability,
  SavedVulnerabilityDetail,
  ScoreResponse,
} from "./types.js";

export interface HealthResponse {
  ok: boolean;
  db: boolean;
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as ApiError;
    throw new ApiRequestError(body.error ?? `Request to ${path} failed`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function getHealth(): Promise<HealthResponse> {
  return request("/api/health");
}

export function getCatalog(): Promise<Catalog> {
  return request("/api/catalog");
}

export function listEnvironments(): Promise<Environment[]> {
  return request("/api/environments");
}

export function getEnvironment(id: number): Promise<EnvironmentDetail> {
  return request(`/api/environments/${id}`);
}

export function createEnvironment(name: string, description?: string): Promise<Environment> {
  return request("/api/environments", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export function updateEnvironment(id: number, body: { name?: string; description?: string }): Promise<Environment> {
  return request(`/api/environments/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteEnvironment(id: number): Promise<void> {
  return request(`/api/environments/${id}`, { method: "DELETE" });
}

export function saveAnswers(id: number, answers: Answer[]): Promise<{ id: number; answers: Answer[] }> {
  return request(`/api/environments/${id}/answers`, {
    method: "PUT",
    body: JSON.stringify({ answers }),
  });
}

export function scoreVector(vector: string): Promise<ScoreResponse> {
  return request("/api/score", {
    method: "POST",
    body: JSON.stringify({ vector }),
  });
}

export function lookupCve(cveId: string, opts?: { refresh?: boolean }): Promise<CveResponse> {
  const qs = opts?.refresh ? "?refresh=1" : "";
  return request(`/api/cve/${encodeURIComponent(cveId)}${qs}`);
}

export function getMajorCves(): Promise<MajorCvesResponse> {
  return request("/api/major-cves");
}

export function listVulnerabilities(): Promise<SavedVulnerability[]> {
  return request("/api/vulnerabilities");
}

export function saveVulnerability(body: {
  vector: string;
  label?: string;
  cveId?: string;
  nvdJson?: unknown;
}): Promise<SavedVulnerability> {
  return request("/api/vulnerabilities", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getVulnerability(id: number): Promise<SavedVulnerabilityDetail> {
  return request(`/api/vulnerabilities/${id}`);
}

export function updateVulnerability(
  id: number,
  body: { label?: string; description?: string },
): Promise<SavedVulnerability> {
  return request(`/api/vulnerabilities/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteVulnerability(id: number): Promise<void> {
  return request(`/api/vulnerabilities/${id}`, { method: "DELETE" });
}

export { ApiRequestError };
