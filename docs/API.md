# API usage

All routes are JSON, under `/api`, served from the same process/port as the frontend (default `8080`). No authentication. Errors are always `{ "error": "message" }` with an appropriate status code — never a stack trace.

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
      "helpDetail": [ "This is about the network path, not the internet in general. ..." ],
      "options": [
        { "id": "internet", "label": "Directly from the internet", "description": "...", "effects": [] },
        { "id": "internal_only", "label": "Only from inside our network", "description": "...", "effects": [ /* MetricEffect[] */ ] }
      ]
    }
  ]
}
```

The full interview question set, versioned by `catalogVersion`. See `server/src/catalog/types.ts` for the `Question`/`Option`/`MetricEffect` shape. `helpDetail` is optional, richer plain-English elaboration shown in the interview's question-help modal, on top of the shorter `whyWeAsk`; every shipped question has one.

## Environments

### Create

```bash
curl -X POST http://localhost:8080/api/environments \
  -H 'Content-Type: application/json' \
  -d '{"name": "Disposable Dev Lab", "description": "Rebuilt nightly from a pipeline", "location": "us-east-1"}'
```

```json
{
  "id": 1,
  "name": "Disposable Dev Lab",
  "description": "Rebuilt nightly from a pipeline",
  "location": "us-east-1",
  "catalogVersion": "1.0",
  "createdAt": "2026-07-08T21:39:30.621Z",
  "updatedAt": "2026-07-08T21:39:30.621Z",
  "interviewCompletion": { "4.0": false, "3.1": false },
  "raisesScores": { "4.0": false, "3.1": false },
  "redFlags": []
}
```

`interviewCompletion` reports whether enough answers exist to score against each CVSS version — an environment with zero answers scores identically to the base vector, so this is what the frontend uses to show "no profile yet" instead of a fake score.

`location` (migration `0004`) is an optional, single-line, plain-text place label ("us-east-1", "Building 4, rack 12") — not markdown, not involved in scoring or the interview. Defaults to `""` and is trimmed server-side.

`name` and `location` are also stripped of one matched pair of wrapping quotes (straight or curly, double or single) after trimming, repeated until no wrapping pair remains — so `"My Lab"`, `'My Lab'`, and `"'My Lab'"` all store as `My Lab`. Interior/unmatched quotes (`Bob's Lab`, `say "hi"`) are untouched. `description` is never quote-stripped.

`raisesScores` reports, per CVSS version, whether this environment's answers contain any override that can push a modified score *above* the base score. This is limited to the structural blast-radius/safety overrides (the "stepping stone" blast-radius answer, "yes" to physical safety) — a "Catastrophic" confidentiality/integrity/availability answer alone does not set this flag (an earlier, broader version of this rule over-triggered: an environment that legitimately has a lot to lose, e.g. a government IL6 system, was flagged permanently). It's re-derived from `environment_answers` at request time, the same as `metrics` below, not read from a stored column. An environment with zero answers reports `false`/`false`.

`redFlags` is an array of triggered configuration red-flag ids — a second, independent tier that correlates stakes answers (Q5/Q6/Q7 "Catastrophic" or Q9 safety "yes") with operational-readiness answers (Q10–Q12) to catch a mismatch between what a location claims to protect and how ready it is: `uncertain_recovery` (high stakes + "Uncertain" recovery), `concentrated_availability` (immediate availability impact + concentrated value density), `hard_to_patch` (high stakes + "Hard" patch effort). Stakes alone never trigger a flag — every rule requires a readiness gap too. Empty array when none trigger. The list route returns just the ids; the detail route (below) also returns each flag's answer provenance.

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
  "raisesScores": { "4.0": false, "3.1": false },
  "raisingAnswers": [],
  "redFlags": [
    {
      "id": "uncertain_recovery",
      "answers": [
        { "questionId": "confidentiality", "optionId": "catastrophic" },
        { "questionId": "recovery", "optionId": "uncertain" }
      ]
    }
  ],
  "answers": [
    { "questionId": "reachability", "optionId": "internal_only" }
  ],
  "metrics": [
    { "cvssVersion": "3.1", "metric": "MAV", "value": "A", "effect": "cap" },
    { "cvssVersion": "3.1", "metric": "CR", "value": "L", "effect": "override" }
  ]
}
```

`metrics` is the materialized cache re-derived from `answers` on every save (`environment_answers` is the source of truth, `environment_metrics` is never hand-edited — see CLAUDE.md's Architecture section).

`raisingAnswers` (detail route only — the list route omits it) is the deduplicated `{ questionId, optionId }` provenance of every answer contributing to a `true` value in `raisesScores`, so the edit view can name the responsible questions/answers in plain English via the catalog it already fetches.

On the detail route, `redFlags` is an array of `{ id, answers }` (the list route above returns just the ids) — `answers` is the deduplicated provenance of every answer that satisfied that flag's condition, same shape/purpose as `raisingAnswers`.

### Rename / edit description / edit location

```bash
curl -X PUT http://localhost:8080/api/environments/1 \
  -H 'Content-Type: application/json' \
  -d '{"name": "Disposable Dev Lab (renamed)", "location": "us-east-1"}'
```

`location` follows the same COALESCE-on-missing-field pattern as `description`: omit it to leave the current value untouched.

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

This is the worked example — a `9.8 Critical` base score landing at `0.0 None` for a "disposable dev lab" profile. Every environment with a completed interview for the vector's CVSS version gets scored; ones without a profile for that version come back as `{ "id", "name", "hasProfile": false }` (no fake score) instead. `changes` is the plain-English "why" data (question/answer provenance, not just raw metric codes) that powers the frontend's expandable panel. `notes` explains answered questions that produced *no* visible change (e.g. capped by an already-less-severe base value) — see `server/test/score-route.test.ts` for the full set of `status` values.

A malformed vector 400s with a specific, non-generic message:

```bash
curl -X POST http://localhost:8080/api/score -H 'Content-Type: application/json' -d '{"vector": "not a vector"}'
```

```json
{ "error": "Unrecognized CVSS vector format. Expected it to start with \"CVSS:4.0/\", \"CVSS:3.1/\", or \"CVSS:3.0/\"." }
```

## NVD CVE lookup

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
  ],
  "details": {
    "description": "Apache Log4j2 2.0-beta9 through 2.15.0 ...",
    "published": "2021-12-10T10:15:09.143",
    "lastModified": "2026-06-17T18:22:56.190",
    "references": [
      { "url": "https://security.apache.org/...", "source": "security@apache.org", "tags": ["Patch", "Vendor Advisory"] }
    ],
    "affectedProducts": { "items": ["apache log4j"], "moreCount": 0 }
  }
}
```

`vectors` lists every CVSS entry NVD published for the CVE (NVD's own score, a CNA's, etc.) — when sources disagree, present all of them and let the caller pick. `primaryVector`/`primaryVersion` is just a sensible default (highest CVSS version, "Primary" source preferred).

`details` is derived at read time from the same cached NVD payload `vectors` comes from — no extra network call, no extra stored column. `description` prefers the English (`lang: "en"`) NVD entry; `references` preserve NVD's tags (`Patch`, `Vendor Advisory`, `Exploit`, …), capped at 20, with `Patch`/`Vendor Advisory`-tagged entries first; `affectedProducts` is a best-effort, deduped `vendor product` list parsed from the CVE's CPE configurations (capped at 15, with `moreCount` for the remainder) — orientation, not a version-accurate applicability check. `details` is `null` when there's no cached NVD payload to derive it from (never the case for this route, since a successful lookup always caches one).

Cache-first: a CVE already looked up is served from the `vulnerabilities` table with no network call and `"cached": true`. Force a re-fetch with `?refresh=1`:

```bash
curl "http://localhost:8080/api/cve/CVE-2021-44228?refresh=1"
```

If NVD can't be reached and there's no cache, this 502s with a friendly message rather than a stack trace:

```json
{ "error": "Couldn't reach NVD. Paste the CVSS vector directly instead." }
```

NVD's unauthenticated rate limit is low (~5 requests/30s); set `NVD_API_KEY` (see `.env.example`) to raise it.

## Major CVEs

Top 10 most critical CVEs published in the last 30 days, sourced from NVD. A distinct endpoint from the per-CVE lookup above — it is not a way to look up a specific CVE.

```bash
curl http://localhost:8080/api/major-cves
```

```json
{
  "cached": true,
  "fetchedAt": "2026-07-09T09:00:00.000Z",
  "cves": [
    { "cveId": "CVE-2026-57983", "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "version": "3.1", "baseScore": 10, "baseSeverity": "CRITICAL", "published": "2026-07-03T00:00:00.000" }
  ]
}
```

Server-cached for 24 hours (single-row cache table, `fetched_at` disclosed in the response) with lazy refresh on access — no background scheduler. A refresh failure serves the stale cache rather than erroring, same as the per-CVE lookup above; if there's no cache at all and the refresh fails, this 502s the same way.

## Saved vulnerabilities

The `vulnerabilities` table doubles as the NVD lookup cache (`GET /api/cve/:cveId`) and this saved list, distinguished by a `saved` flag — `GET /api/vulnerabilities` only ever returns rows the user explicitly saved.

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

`label`, `description`, and `cveId` are optional — omit `cveId` for a plain pasted vector (`source` becomes `"vector"` instead of `"nvd"`, and `label` falls back to the normalized vector string if not given). The score and normalized vector are always recomputed server-side from `vector`, not trusted from the request — the point of saving is a durable, re-scoreable record, not whatever a client happened to compute.

A non-empty `description` is stored on both the insert and update path, winning over whatever the matched row already had and over the NVD prefill described below — this is how the Scoring page's save panel lets a description be set at save time, not only afterward via `PUT`. An empty or absent `description` changes nothing: an update keeps the existing row's value, a fresh NVD-sourced save still gets the prefill, and a fresh pasted-vector save stays empty.

Saving is an **upsert**, not an insert: a second save with the same `cveId` (or the same normalized `vector` for a plain pasted-vector save) updates the existing saved entry in place — including reusing an NVD-lookup cache row for that CVE if one already exists — rather than creating a duplicate. The response's `overwritten` field is `true` when an already-*saved* entry was updated, `false` on a first save (`201`) or on a save that only reused a cache row (still `201`); an update to an already-saved entry returns `200`.

A CVE-sourced save also carries over that CVE's cached NVD data automatically — the upsert reuses the lookup-cache row's `nvd_json`, so the detail route's `vectors` array is populated without the client needing to send an `nvdJson` field.

A CVE-sourced save (`cveId` set) with an otherwise-empty `description` is also prefilled from that cached NVD payload's English description — the same text the detail route's `details.description` derives from `extractCveDetails()`. This never overwrites a non-empty `description`, so a re-save of an already-saved CVE whose description the user has edited (or previously prefilled) is left alone; a pasted-vector save (no `cveId`) or a CVE with no cached `nvd_json` always keeps `description` empty. Not truncated; stored and rendered as Markdown like any other description.

### Rename / edit description

```bash
curl -X PUT http://localhost:8080/api/vulnerabilities/2 \
  -H 'Content-Type: application/json' \
  -d '{"label": "Log4Shell (prod-facing)", "description": "Tracked in the Q3 remediation sprint."}'
```

Only `label` and `description` are editable this way — `vector`, `baseScore`, `cvssVersion`, and `cveId` are fixed at save time and ignored if sent. `description` renders as Markdown wherever it's displayed.

### List / get / delete

```bash
curl http://localhost:8080/api/vulnerabilities
curl http://localhost:8080/api/vulnerabilities/2
curl -X DELETE http://localhost:8080/api/vulnerabilities/2   # 204 No Content
```

`GET /api/vulnerabilities` accepts an optional `q` query parameter — a case-insensitive substring search matched against `label`, `cve_id`, `vector`, `description`, and the raw cached NVD JSON text (which makes the NVD description, affected products/CPE strings, and reference URLs/tags searchable with no extra columns). Absent or blank `q` returns every saved row, exactly as before; `saved = 0` cache rows never surface regardless of match.

```bash
curl 'http://localhost:8080/api/vulnerabilities?q=log4j'
```

The detail route additionally includes `vectors` and `details` (same shapes as the CVE lookup route above, both derived from the row's cached NVD JSON) when `source` is `"nvd"`; both are `[]`/`null` for a plain pasted-vector save, which has no cached NVD payload to derive them from.
