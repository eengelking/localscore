# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

localscore turns a CVSS base score into the score that actually applies to a specific environment. A vulnerability scanner reports a 10.0; CVSS environmental metrics can correct that for systems that aren't worst-case, but the official FIRST calculators are expert-facing. localscore asks ~12 plain-English questions about a "location" (e.g. "My Data Center", "Retail Kiosks") and derives CVSS environmental metric profiles from the answers, then applies those profiles to any pasted CVSS vector or looked-up CVE.

Self-hosted single container, SQLite on a volume, no accounts, no cloud dependency except an optional NVD CVE lookup.

The product works end-to-end: an npm-workspaces monorepo (`server/` = Hono + better-sqlite3 API, `web/` = React + Vite frontend), the full interview catalog, environment CRUD with answer-derivation, a working scoring engine, a real frontend (environments list, interview wizard, results screen with both a paste-a-vector flow and a CVE-lookup flow, plus a saved-vulnerabilities list with search/filter), NVD CVE lookup, and saved-vulnerability CRUD. No stubbed API routes and no unbuilt UI surface for any of the above.

## Mandated tech stack

- **Runtime**: Node 24 LTS, TypeScript everywhere, strict mode.
- **Backend**: Hono (Fastify only if Hono proves awkward) serving both the JSON API and the built frontend static assets from one process on one port (default 8080).
- **Frontend**: React + Vite, built to static assets at image build time. Plain CSS (custom properties for theming) or a tiny utility layer, no heavy UI framework, no large-runtime component library. Use the `frontend-design` skill for any UI/visual work, see "Skill map" below.
- **Database**: SQLite via `better-sqlite3`, single file at `/data/localscore.db`, WAL mode. Migrations are sequential numbered SQL files (`migrations/0001_*.sql`, ...) applied at startup inside a transaction, tracked in a `schema_migrations` table.
- **Scoring**: MUST match FIRST's reference calculators exactly (v4.0 and v3.1). Built on `ae-cvss-calculator`, validated against reference test vectors. Hand-rolled scoring math without reference-validated test vectors is not acceptable.
- **Testing**: Vitest. Tests are a release gate, enforced both locally and by CI. See the `testing` skill.
- **Container**: multi-stage Dockerfile (plain OCI, builds and runs under Docker or Podman), non-root user, `node:24-slim`/alpine runtime, final image < 300 MB, `HEALTHCHECK` on `/api/health`. The maintainer runs Podman day-to-day, so use `podman`/`podman compose` in docs and examples.
- Published image: `docker.io/eengelking/localscore` (tags `latest`, `1.2.7`). See the `release` skill for the publish/tag/verify procedure.

No external services, no telemetry. The only outbound network call anywhere in the app is the optional NVD CVE lookup.

## Architecture and invariants

These are the rules that must never break. Deep implementation detail beyond these invariants lives in `docs/BACKEND.md` and `docs/FRONTEND.md`; the API route table with curl examples lives in `docs/API.md`.

**Environments store raw interview answers, not derived metrics, as the source of truth.** `environment_answers` (question_id + option_id pairs) is authoritative; `environment_metrics` is a materialized cache re-derived from those answers on every save. This is what lets the question catalog evolve over time (`CATALOG_VERSION`) and lets a completed interview be re-opened with prior answers pre-selected without losing data. Never treat `environment_metrics` as something to hand-edit directly, it's always regenerated from answers plus catalog in code.

**The question catalog lives in code** (a versioned TS module, `server/src/catalog/catalog.ts`), not in the database. Each answer option emits zero or more `MetricEffect`s tagged with an `effect` of `override` or `cap`:

- **`override`**: unconditionally replaces the base metric (used for environment facts like CR/IR/AR, or MVC:N when a location genuinely holds nothing confidential). Can legitimately raise a score above base, this is intentional for the "blast radius" (Q8) and "safety" (Q9) questions.
- **`cap`**: only applies if it makes the metric *less* severe than the base vector's value, using the severity orderings in `server/src/scoring/orderings.ts`. Never raises severity.

Conflict rule when two questions touch the same metric: later question's `override` wins; a `cap` never displaces an existing `override`. The concrete case baked into the catalog: Q9 Safety's MSI/MSA override always wins over Q8 blast-radius for those same metrics.

**Supplemental metrics (v4.0 S, R, V, RE)** are collected and stored per-environment but are strictly display-only, they MUST NOT affect any computed score (per the CVSS v4.0 specification's own §6). **AU, U (provider-assigned) and threat/temporal metrics (E, RL, RC)** are the opposite: never interviewed, per-vulnerability not per-environment, displayed/scored only from what's pasted in.

**v3.0/v2 handling**: CVSS v3.0 vectors are scored using v3.1 equations against the v3.1 profile, with a UI-visible disclosure, never silent. v2.0 vectors (including bare `AV:N/AC:L/Au:N/...` syntax) get a friendly "not supported yet" rejection, not an attempted parse.

**Zero-answers invariant**: an environment with zero answers MUST reproduce the base score exactly, for any pasted vector. This is both a core design invariant and a required test (`server/test/scoring.test.ts`).

**The worked example**: base `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = 9.8, "Disposable Dev Lab" profile resolves to 0.0. This MUST exist as an exact-match test case.

If a pasted vector already contains environmental metrics, the environment profile's values win for metrics the profile defines; the vector's environmental values fill in the rest, with a UI warning when this happens. Full metric-to-question mapping lives in `server/src/catalog/catalog.ts`'s `MetricEffect` wiring per question, consult it rather than re-deriving which question feeds which metric.

Scoring flow: parse the pasted vector, detect version (v4.0 / v3.1 / v3.0-scored-as-3.1-with-a-disclosed-note / v2-rejected), for each environment with a completed interview for that version apply stored effects (override then cap-if-less-severe) on top of the base vector, compute with version-appropriate reference math, render one row per environment sorted by modified score descending, each expandable into a plain-English "why" panel (question/answer text, not raw metric codes, with codes in fine print).

## API surface

All JSON under `/api`, no auth, errors as `{ error: string }` with correct status codes. Frontend is served for all non-`/api` paths (SPA fallback to `index.html`) from the same process/port. See `docs/API.md` for the full route table and curl examples for every route (`environments` CRUD + answers, `POST /api/score`, `GET /api/cve/:cveId`, `vulnerabilities` CRUD, `/api/health`, `/api/catalog`).

## Skill map

Detailed operational workflows live in `.claude/skills/`, not in this file. Consult the matching skill instead of re-deriving the procedure:

- **Finishing any change headed to `main`** (opening the PR, version bump, container publish, tag, GitHub Release): the `release` skill.
- **Anything test-related** (running suites, writing a test, a red CI check, the pre-merge container gate, Playwright UI verification): the `testing` skill.
- **A Dependabot pull request** (triage, the pre-authorized patch/minor autonomous flow, a red-CI update): the `dependabot` skill.
- **Before every commit**, and whenever editing `README.md`/`CLAUDE.md`/`docs/*`/`CHANGELOG.md`: the `documentation` skill's doc-sync pass and voice guide.
- **Publishing an image**: the `release` skill, which invokes the `attestation` skill (SBOM, keyless cosign signature) after a verified push.
- **Any UI or visual work in `web/`**: the `frontend-design` skill before writing JSX/CSS. For any color tied to data (severity/status colors, deltas, chart series): also the `dataviz` skill.

Two rules gate everything above and stay inline here because they're policy, not procedure:

- **Never commit directly to `main`.** Branch off the latest `main` before starting any work.
- **Merging stays manual.** The user reviews and merges in the GitHub UI, except the documented Dependabot patch/minor autonomous path (owned by the `dependabot` skill).
- **Filing an issue is not authorization to work on it.** Wait for the user to say which filed issue to pick up next.

## Issue intake and triage

When the user hands over a batch of issues (bug reports, feature requests, feedback) rather than a single task, don't start coding immediately. Work in two passes:

1. **Assess and group.** Read the full list before filing anything. Issues that share a root cause, code path, or feature area become **one** GitHub issue (body enumerates each original report as a sub-bullet so nothing gets silently dropped); issues that are genuinely unrelated stay separate. Check `gh issue list` first so a resubmitted or overlapping report doesn't create a duplicate.
2. **File via `gh issue create`** (title + body, labels where it helps) for each resulting issue, grouped or standalone. Present the user the final list of filed issues (with numbers/links) and stop there.

Filing an issue is not authorization to work on it, wait for the user to say which filed issue(s) to pick up next, same as any other task.

## Known gotchas

- **npm workspace hoisting affects the Dockerfile.** `npm ci` hoists shared dependencies to the workspace-root `node_modules`, not `server/node_modules`, the runtime image stage copies `/app/node_modules` (root), not a per-workspace one. If you add a server-only dependency that npm decides *not* to hoist (e.g. a conflicting version), the runtime COPY may need to also grab `server/node_modules`, check after `npm ci` whether it exists before assuming it doesn't.
- **`npm audit` reports vulnerabilities** in the `vite`/`vitest`/`esbuild` dev-tooling chain (dev-server-only exposure, not a runtime/production risk), rooted in `vitest`'s own bundled `esbuild`/`vite-node`. Don't be surprised by it, and don't `npm audit fix --force` without deliberately taking that upgrade; check the current state before assuming this is still open, since dependency bumps happen regularly via Dependabot.
- **`podman compose build`/`up` can fail locally** with `error listing credentials - err: exec: "docker-credential-desktop": executable file not found` if `~/.docker/config.json` has `"credsStore": "desktop"` left over from Docker Desktop, even though Podman is what's actually running. Workaround for a one-off command: `DOCKER_CONFIG=<empty-dir-with-{}-config.json> podman compose ...`. Don't edit the user's real `~/.docker/config.json` to fix this, it's outside the project and outside this repo's concern.

## Documentation policy

All project documentation except `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and `CLAUDE.md` itself lives under `docs/` (`docs/API.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`). GitHub-specific community-health files (`.github/CODE_OF_CONDUCT.md`, `.github/SECURITY.md`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`) are the one exception, since GitHub only recognizes them at those fixed paths. See the `documentation` skill for the full placement policy, the doc-sync rule, and the project's voice guide.

## Development

Run from the repo root unless noted.

- `npm install` installs all workspaces.
- `npm run dev:server` runs the server on :8080 with reload (`tsx watch`).
- `npm run dev:web` runs the Vite dev server with `/api` proxied to :8080 (run alongside `dev:server`).
- `npm run build` builds `web` (static assets to `web/dist`) then `server` (to `server/dist`, migrations copied alongside).
- `npm start` runs the built server (`server/dist/index.js`), serving the built frontend and API on one port.
- `npm test` runs the full test suite. For the single-file command, the full command matrix, and the two-tier (npm during development, container before merge) testing model, see the `testing` skill.
- `podman build --format docker -t localscore .` builds the container. See the `testing` skill for local verification and the `release` skill for a publishable build.

`DATA_DIR` (default `./data`) and `PORT` (default `8080`) are read from the environment; see `.env.example`.
