# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Scaffolding is in place: an npm-workspaces monorepo (`server/` = Hono + better-sqlite3 API, `web/` = React + Vite frontend), the full interview catalog (SPEC.md §5.2), environment CRUD with answer-derivation, and the initial DB migration. **Scoring (`POST /api/score`), NVD lookup, and saved-vulnerability CRUD are stubbed (HTTP 501)** — SPEC.md §2.4 requires evaluating a reference-validated CVSS library before writing that code; see `server/src/scoring/index.ts`.

### Commands

Run from the repo root unless noted.

- `npm install` — installs all workspaces.
- `npm run dev:server` — server on :8080 with reload (`tsx watch`).
- `npm run dev:web` — Vite dev server with `/api` proxied to :8080 (run alongside `dev:server`).
- `npm run build` — builds `web` (static assets to `web/dist`) then `server` (to `server/dist`, migrations copied alongside).
- `npm start` — runs the built server (`server/dist/index.js`); serves the built frontend + API on one port.
- `npm test` — runs the server's Vitest suite (`server/test/*.test.ts`). To run one file: `npm run test --workspace server -- test/catalog.test.ts`.
- `npm run typecheck` / `npm run lint` — both workspaces.
- `podman build -t localscore .` / `podman compose up` — container build per SPEC.md §9. The maintainer uses **Podman, not Docker**; the Dockerfile/compose.yaml are plain OCI and must keep working under Docker too, but write any documentation/examples with `podman`.

`DATA_DIR` (default `./data`) and `PORT` (default `8080`) are read from the environment; see `.env.example`.

## Source of truth

**`SPEC.md` is the full implementation contract.** Read it in its entirety before writing any code — it specifies the mandated tech stack (§3), data model (§4), the exact interview question catalog with metric mappings (§5), scoring rules (§2, §6), API surface (§8), container packaging (§9), and testing requirements (§10). Treat every MUST/MUST NOT in it as a hard requirement and every SHOULD as the default unless there is a documented reason to deviate. Do not improvise architecture that SPEC.md already decided.

## What this project is

localscore turns a CVSS base score into the score that actually applies to a specific environment. A vulnerability scanner reports a 10.0; CVSS environmental metrics can correct that for systems that aren't worst-case, but the official FIRST calculators are expert-facing. localscore asks ~12 plain-English questions about a "location" (e.g. "My Data Center", "Retail Kiosks") and derives CVSS environmental metric profiles from the answers, then applies those profiles to any pasted CVSS vector or looked-up CVE.

Self-hosted single container, SQLite on a volume, no accounts, no cloud dependency except an optional NVD CVE lookup.

## Mandated tech stack (SPEC.md §3)

- **Runtime**: Node 22 LTS, TypeScript everywhere, strict mode.
- **Backend**: Hono (Fastify only if Hono proves awkward) serving both the JSON API and the built frontend static assets from one process on one port (default 8080).
- **Frontend**: React + Vite, built to static assets at image build time. Plain CSS (custom properties for theming) or a tiny utility layer — no heavy UI framework, no large-runtime component library.
- **Database**: SQLite via `better-sqlite3`, single file at `/data/localscore.db`, WAL mode. Migrations are sequential numbered SQL files (`migrations/0001_*.sql`, …) applied at startup inside a transaction, tracked in a `schema_migrations` table.
- **Scoring**: MUST match FIRST's reference calculators exactly (v4.0 and v3.1). Use an existing maintained library (`ae-cvss-calculator` is the leading candidate) or vendor FIRST's reference code, validated against reference test vectors before committing. Hand-rolled scoring math without reference-validated test vectors is explicitly not acceptable.
- **Testing**: Vitest. Tests are a release gate (§10).
- **Container**: multi-stage Dockerfile (plain OCI — builds and runs under Docker or Podman), non-root user, `node:22-slim`/alpine runtime, final image < 300 MB, `HEALTHCHECK` on `/api/health`. The maintainer runs Podman day-to-day, so use `podman`/`podman compose` in docs and examples.

No external services, no telemetry. The only outbound network call anywhere in the app is the optional NVD CVE lookup.

## Architecture (why the pieces fit together)

The core design tension the whole spec is built around: **environments store raw interview answers, not derived metrics, as the source of truth.** `environment_answers` (question_id + option_id pairs) is authoritative; `environment_metrics` is a materialized cache re-derived from those answers on every save. This is what lets the question catalog evolve over time (`CATALOG_VERSION`) and lets a completed interview be re-opened with prior answers pre-selected without losing data. Never treat `environment_metrics` as something to hand-edit directly — it's always regenerated from answers + catalog in code.

The **question catalog lives in code** (a versioned TS module), not in the database — see SPEC.md §5.1 for the `Question`/`Option`/`MetricEffect` shape. Each answer option emits zero or more `MetricEffect`s tagged with an `effect` of `override` or `cap`:

- **`override`**: unconditionally replaces the base metric (used for environment facts like CR/IR/AR, or MVC:N when a location genuinely holds nothing confidential). Can legitimately raise a score above base — this is intentional for the "blast radius" (Q8) and "safety" (Q9) questions.
- **`cap`**: only applies if it makes the metric *less* severe than the base vector's value, using the severity orderings in §2.2. Never raises severity.

Conflict rule when two questions touch the same metric (§5.3): later question's `override` wins; a `cap` never displaces an existing `override`. The concrete case baked into the catalog: Q9 Safety's MSI/MSA override always wins over Q8 blast-radius for those same metrics.

**Supplemental metrics (v4.0 S, R, V, RE)** are collected and stored per-environment but are strictly display-only — they MUST NOT affect any computed score (v4.0 spec §6). **AU, U (provider-assigned) and threat/temporal metrics (E, RL, RC)** are the opposite: never interviewed, per-vulnerability not per-environment, displayed/scored only from what's pasted in.

Scoring flow (§6): parse the pasted vector → detect version (v4.0 / v3.1 / v3.0-scored-as-3.1-with-a-disclosed-note / v2-rejected) → for each environment with a completed interview for that version, apply stored effects (override then cap-if-less-severe) on top of the base vector → compute with version-appropriate reference math → render one row per environment sorted by modified score descending, each expandable into a plain-English "why" panel (question/answer text, not raw metric codes, with codes in fine print).

An environment with zero answers MUST reproduce the base score exactly — this is both a design invariant (§2.3) and a required test (§10.2).

## Domain rules to internalize before touching scoring code

- CVSS v3.0 vectors are scored using v3.1 equations against the v3.1 profile, with a UI-visible disclosure — never silent (§2.5).
- v2.0 vectors (including bare `AV:N/AC:L/Au:N/...` syntax) get a friendly "not supported yet" rejection, not an attempted parse.
- If a pasted vector already contains environmental metrics, the environment profile's values win for metrics the profile defines; the vector's environmental values fill in the rest. UI should warn when this happens.
- Full metric-to-question mapping is in Appendix A of SPEC.md — consult it rather than re-deriving which question feeds which metric.
- The worked example in §6 (base `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = 9.8, "Disposable Dev Lab" profile → 0.0) MUST exist as an exact-match test case.

## API surface (SPEC.md §8)

All JSON under `/api`, no auth in v1, errors as `{ error: string }` with correct status codes. Frontend is served for all non-`/api` paths (SPA fallback to `index.html`) from the same process/port. See §8 for the full route table (`environments` CRUD + answers, `POST /api/score`, `GET /api/cve/:cveId`, `vulnerabilities` CRUD, `/api/health`, `/api/catalog`).
