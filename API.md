# API usage

All routes are JSON, under `/api`, served from the same process/port as the frontend (default `8080`). No authentication in v1. Errors are always `{ "error": "message" }` with an appropriate status code — never a stack trace. See `docs/SPEC01.md` §8 for the contract this implements.

Examples below assume the server is running at `http://localhost:8080` — swap the port if you're running the dev server (`npm run dev:server`, default `8080` too) or a custom `PORT`.

## Health

```bash
curl http://localhost:8080/api/health
```

```json
{ "ok": true, "db": true }
```

Used as the container's `HEALTHCHECK`.

## Catalog

```bash
curl http://localhost:8080/api/catalog
```

```json
{
  "catalogVersion": "1.0",
  "questions": [
    {
      "id": "reachability",
      "order": 1,
      "question": "How could an outsider reach the systems at this location?",
      "whyWeAsk": "A vulnerability that's exploitable \"from the internet\" only matters that way if the internet can actually reach you.",
      "options": [
        { "id": "internet", "label": "Directly from the internet", "description": "...", "effects": [] },
        { "id": "internal_only", "label": "Only from inside our network", "description": "...", "effects": [ /* MetricEffect[] */ ] }
      ]
    }
  ]
}
```

The full interview question set, versioned by `catalogVersion`. See `docs/SPEC01.md` §5.1 for the `Question`/`Option`/`MetricEffect` shape.

## Environments

### Create

```bash
curl -X POST http://localhost:8080/api/environments \
  -H 'Content-Type: application/json' \
  -d '{"name": "Disposable Dev Lab", "description": "Rebuilt nightly from a pipeline"}'
```

```json
{
  "id": 1,
  "name": "Disposable Dev Lab",
  "description": "Rebuilt nightly from a pipeline",
  "catalogVersion": "1.0",
  "createdAt": "2026-07-08T21:39:30.621Z",
  "updatedAt": "2026-07-08T21:39:30.621Z",
  "interviewCompletion": { "4.0": false, "3.1": false }
}
```

`interviewCompletion` reports whether enough answers exist to score against each CVSS version — an environment with zero answers scores identically to the base vector (docs/SPEC01.md §2.3), so this is what the frontend uses to show "no profile yet" instead of a fake score.

### List

```bash
curl http://localhost:8080/api/environments
```

Returns an array of the same shape as create (without `answers`/`metrics` — see detail below).

### Get detail (answers + derived metrics)

```bash
curl http://localhost:8080/api/environments/1
```

```json
{
  "id": 1,
  "name": "Disposable Dev Lab",
  "...": "...",
  "answers": [
    { "questionId": "reachability", "optionId": "internal_only" }
  ],
  "metrics": [
    { "cvssVersion": "3.1", "metric": "MAV", "value": "A", "effect": "cap" },
    { "cvssVersion": "3.1", "metric": "CR", "value": "L", "effect": "override" }
  ]
}
```

`metrics` is the materialized cache re-derived from `answers` on every save (docs/SPEC01.md's architecture note: `environment_answers` is the source of truth, `environment_metrics` is never hand-edited).

### Rename / edit description

```bash
curl -X PUT http://localhost:8080/api/environments/1 \
  -H 'Content-Type: application/json' \
  -d '{"name": "Disposable Dev Lab (renamed)"}'
```

### Save interview answers (resumable, partial OK)

```bash
curl -X PUT http://localhost:8080/api/environments/1/answers \
  -H 'Content-Type: application/json' \
  -d '{
    "answers": [
      {"questionId": "reachability", "optionId": "internal_only"},
      {"questionId": "confidentiality", "optionId": "nothing"},
      {"questionId": "integrity", "optionId": "nothing"},
      {"questionId": "availability", "optionId": "nobody"},
      {"questionId": "blast_radius", "optionId": "dead_end"}
    ]
  }'
```

Upserts each answer (unanswered questions can be omitted and answered later — this is what makes the interview resumable) and re-derives `environment_metrics` from the full answer set. Returns `{ id, answers, metrics }`.

### Delete

```bash
curl -X DELETE http://localhost:8080/api/environments/1
```

`204 No Content`. Cascades to that environment's answers and metrics.

## Scoring

```bash
curl -X POST http://localhost:8080/api/score \
  -H 'Content-Type: application/json' \
  -d '{"vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"}'
```

```json
{
  "base": {
    "version": "3.1",
    "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
    "score": 9.8,
    "severity": "Critical",
    "pastedVectorHasEnvironmentalMetrics": false
  },
  "environments": [
    {
      "id": 1,
      "name": "Disposable Dev Lab",
      "hasProfile": true,
      "score": 0,
      "severity": "None",
      "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:L/IR:L/AR:L/MAV:A/MAC:X/MPR:X/MUI:X/MS:U/MC:N/MI:N/MA:N",
      "delta": -9.8,
      "changes": [
        {
          "metric": "MAV",
          "metricName": "Modified Attack Vector",
          "fromValue": "N",
          "fromValueName": "Network",
          "toValue": "A",
          "toValueName": "Adjacent Network",
          "effect": "cap",
          "questionId": "reachability",
          "optionId": "internal_only"
        }
      ],
      "notes": []
    }
  ]
}
```

This is the worked example from `docs/SPEC01.md` §6 — a `9.8 Critical` base score landing at `0.0 None` for a "disposable dev lab" profile. Every environment with a completed interview for the vector's CVSS version gets scored; ones without a profile for that version come back as `{ "id", "name", "hasProfile": false }` (no fake score) instead. `changes` is the plain-English "why" data (question/answer provenance, not just raw metric codes) that powers the frontend's expandable panel. `notes` explains answered questions that produced *no* visible change (e.g. capped by an already-less-severe base value) — see `server/test/score-route.test.ts` for the full set of `status` values.

A malformed vector 400s with a specific, non-generic message:

```bash
curl -X POST http://localhost:8080/api/score -H 'Content-Type: application/json' -d '{"vector": "not a vector"}'
```

```json
{ "error": "Unrecognized CVSS vector format — expected it to start with \"CVSS:4.0/\", \"CVSS:3.1/\", or \"CVSS:3.0/\"." }
```

## NVD CVE lookup

**Not yet wired into the frontend** — this only works via direct API calls today (see `CLAUDE.md`).

```bash
curl http://localhost:8080/api/cve/CVE-2021-44228
```

```json
{
  "cveId": "CVE-2021-44228",
  "cached": false,
  "fetchedAt": "2026-07-08T21:39:44.197Z",
  "primaryVector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
  "primaryVersion": "3.1",
  "vectors": [
    { "source": "nvd@nist.gov", "type": "Primary", "version": "3.1", "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", "baseScore": 10, "baseSeverity": "CRITICAL" },
    { "source": "134c704f-9b21-4f2e-91b3-4a467353bcc0", "type": "Secondary", "version": "3.1", "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", "baseScore": 10, "baseSeverity": "CRITICAL" }
  ]
}
```

`vectors` lists every CVSS entry NVD published for the CVE (NVD's own score, a CNA's, etc.) — per `docs/SPEC01.md` §7, when sources disagree, present all of them and let the caller pick. `primaryVector`/`primaryVersion` is just a sensible default (highest CVSS version, "Primary" source preferred).

Cache-first: a CVE already looked up is served from the `vulnerabilities` table with no network call and `"cached": true`. Force a re-fetch with `?refresh=1`:

```bash
curl "http://localhost:8080/api/cve/CVE-2021-44228?refresh=1"
```

If NVD can't be reached and there's no cache, this 502s with a friendly message rather than a stack trace:

```json
{ "error": "Couldn't reach NVD — paste the CVSS vector directly instead." }
```

NVD's unauthenticated rate limit is low (~5 requests/30s); set `NVD_API_KEY` (see `.env.example`) to raise it.

## Saved vulnerabilities

The `vulnerabilities` table doubles as the NVD lookup cache (`GET /api/cve/:cveId`) and this saved list, distinguished by a `saved` flag (`docs/SPEC02.md` §7.1) — `GET /api/vulnerabilities` only ever returns rows the user explicitly saved.

### Save

```bash
curl -X POST http://localhost:8080/api/vulnerabilities \
  -H 'Content-Type: application/json' \
  -d '{"vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", "cveId": "CVE-2021-44228", "label": "Log4Shell"}'
```

```json
{
  "id": 2,
  "label": "Log4Shell",
  "description": "",
  "source": "nvd",
  "cveId": "CVE-2021-44228",
  "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
  "cvssVersion": "3.1",
  "baseScore": 10,
  "fetchedAt": null,
  "createdAt": "2026-07-08T21:39:49.315Z",
  "overwritten": false
}
```

`label` and `cveId` are optional — omit `cveId` for a plain pasted vector (`source` becomes `"vector"` instead of `"nvd"`, and `label` falls back to the normalized vector string if not given). The score and normalized vector are always recomputed server-side from `vector`, not trusted from the request — the point of saving is a durable, re-scoreable record, not whatever a client happened to compute.

Saving is an **upsert**, not an insert: a second save with the same `cveId` (or the same normalized `vector` for a plain pasted-vector save) updates the existing saved entry in place — including reusing an NVD-lookup cache row for that CVE if one already exists — rather than creating a duplicate. The response's `overwritten` field is `true` when an already-*saved* entry was updated, `false` on a first save (`201`) or on a save that only reused a cache row (still `201`); an update to an already-saved entry returns `200`.

A CVE-sourced save also carries over that CVE's cached NVD data automatically — the upsert reuses the lookup-cache row's `nvd_json`, so the detail route's `vectors` array is populated without the client needing to send an `nvdJson` field (`docs/SPEC02.md` §7.3).

### Rename / edit description

```bash
curl -X PUT http://localhost:8080/api/vulnerabilities/2 \
  -H 'Content-Type: application/json' \
  -d '{"label": "Log4Shell (prod-facing)", "description": "Tracked in the Q3 remediation sprint."}'
```

Only `label` and `description` are editable this way — `vector`, `baseScore`, `cvssVersion`, and `cveId` are fixed at save time and ignored if sent. `description` renders as Markdown wherever it's displayed (`docs/SPEC02.md` §4).

### List / get / delete

```bash
curl http://localhost:8080/api/vulnerabilities
curl http://localhost:8080/api/vulnerabilities/2
curl -X DELETE http://localhost:8080/api/vulnerabilities/2   # 204 No Content
```

The detail route additionally includes `vectors` (parsed from the cached NVD JSON, same shape as the CVE lookup route) when `source` is `"nvd"`.
