# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

The product works end-to-end: an npm-workspaces monorepo (`server/` = Hono + better-sqlite3 API, `web/` = React + Vite frontend), the full interview catalog (SPEC.md §5.2), environment CRUD with answer-derivation, the initial DB migration, a working **scoring engine** (`POST /api/score`, `server/src/scoring/`), and a real **frontend** (environments list → interview wizard → paste-a-vector results screen, all wired to the API — no more placeholder page). **NVD lookup and saved-vulnerability CRUD are still stubbed (HTTP 501)** — those are the remaining unbuilt pieces.

### Frontend

`web/src/` — `App.tsx` does simple state-based view switching (`environments` / `interview` / `score`), no router library. `pages/` holds the three screens, `components/` the shared pieces (`SeverityPill`, `AnimatedScore`, `ScoreChanges`, `EnvironmentResultRow`). `api.ts` wraps every `/api/*` call; `types.ts` mirrors the server's response shapes.

Design system lives in `web/src/styles.css` as CSS custom properties (no framework, per SPEC.md §3): IBM Plex Mono for headlines/scores/vector strings, Archivo for body copy (via `@fontsource/*`, self-hosted — **never** load fonts from a CDN, SPEC.md requires the app work fully offline). Import only the `latin-*.css` subset files from `@fontsource` packages, not the bare weight files — the latter pull in every unicode subset (cyrillic, vietnamese, greek, ...) and roughly quadruple the font payload for no reason in an English-only UI.

The results screen's signature interaction: each environment's score animates from the base score to its modified score on load (`AnimatedScore`), with color morphing through the severity scale in transit — the "a 10 might actually be a zero" moment, dramatized once. Respects `prefers-reduced-motion`. `None` severity deliberately renders with no color at all (quiet muted text, no pill) rather than a fifth hue — see "Frontend design" below for why.

### Scoring engine

Built on `ae-cvss-calculator` (metaeffekt, Apache-2.0, zero runtime deps, covers CVSS 2.0/3.0/3.1/4.0) after evaluating it per SPEC.md §2.4 — reproduces the spec's worked example (base `9.8` → environmental `0.0`) and known reference vectors exactly; see `server/test/scoring.test.ts`. It's a CommonJS package under `"type": "module"` — import it with `import pkg from "ae-cvss-calculator"; const { Cvss3P1, Cvss4P0 } = pkg;`, not named imports (TS's `NodeNext` resolution will reject named imports from a CJS package).

- `server/src/scoring/parse.ts` — version detection/routing (§2.5) and friendly parse errors. Note: `AV:X` is *not* an invalid value — `X` is the real "Not Defined" enum member shared by every metric — so it's caught separately as "missing required base metrics" via `isBaseFullyDefined()`, not as an unknown-value error.
- `server/src/scoring/orderings.ts` — the §2.2 cap severity orderings, and `baseCounterpartMetric()` (strip a leading `M` — works uniformly for every M-prefixed metric, cap or override; CR/IR/AR and the v4 supplemental metrics have no base counterpart).
- `server/src/scoring/index.ts` — `applyEnvironment()` (mutates a parsed vector per override/cap rules, returns human-readable change explanations with question/option provenance for a future "why" panel) and `scoreForEnvironment()` (parse + apply + compute in one call).
- `server/src/catalog/derive.ts` — `DerivedMetric` now carries `questionId`/`optionId` provenance (used for change explanations), in addition to what's persisted to `environment_metrics`.
- `POST /api/score` recomputes each environment's derived metrics fresh from `environment_answers` at request time rather than reading the persisted `environment_metrics` cache — simpler and self-consistent, at negligible cost (12 questions).

### Frontend design

When designing or building UI in `web/` — new screens, layout/visual changes, or anything touching typography/color/spacing — invoke the `frontend-design` skill first. It's installed and available in this environment (verified 2026-07-08). Use it before writing JSX/CSS, not as an afterthought, so the interview and results screens read as intentionally designed rather than default scaffolding.

For any color tied to *data* specifically — severity/status colors, deltas, chart series, stat tiles — also invoke the `dataviz` skill and run its `validate_palette.js` against candidate hexes rather than picking colors by eye. This is how the current severity palette (`--severity-low/medium/high/critical` in `web/src/styles.css`) was derived: the skill's reserved status palette (good/warning/serious/critical), contrast-checked with near-black text on every fill. `None` deliberately has no color at all (quiet muted text) — a content-driven choice, not an oversight, so don't "fix" it by giving it a hue.

### Verifying frontend changes

This environment has no built-in browser/screenshot tool, but a system Chrome install is available at `/Applications/Google Chrome.app`. To actually see and click through UI changes rather than trusting the code: `npm install --no-save playwright-core` (ad-hoc — do **not** add it to any `package.json`, it's a verification tool, not an app dependency), then drive it with `chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true })`. Screenshot with `page.screenshot({ path, fullPage: true })`.

Pitfall hit while building the interview UI: Playwright's `text=` selector does a case-insensitive substring match, so `page.click("text=Next")` can silently click a non-interactive element whose text happens to contain "next" (e.g. an option description like "...wiped on the **next** automated rebuild") instead of the actual Next button — no error, just a no-op. Use `page.getByRole("button", { name, exact: true })` or scope with a specific CSS class (e.g. `.interview-nav .button-primary`) instead of loose text matching.

### Commands

Run from the repo root unless noted.

- `npm install` — installs all workspaces.
- `npm run dev:server` — server on :8080 with reload (`tsx watch`).
- `npm run dev:web` — Vite dev server with `/api` proxied to :8080 (run alongside `dev:server`).
- `npm run build` — builds `web` (static assets to `web/dist`) then `server` (to `server/dist`, migrations copied alongside).
- `npm start` — runs the built server (`server/dist/index.js`); serves the built frontend + API on one port.
- `npm test` — runs the server's Vitest suite (`server/test/*.test.ts`). To run one file: `npm run test --workspace server -- test/catalog.test.ts`.
- `npm run typecheck` / `npm run lint` — both workspaces.
- `podman build --format docker -t localscore .` then `podman run ...` — container build per SPEC.md §9. The maintainer uses **Podman, not Docker**; the Dockerfile/compose.yaml are plain OCI and must keep working under Docker too, but write any documentation/examples with `podman`. **`--format docker` is required for a direct `podman build`** — Podman's default OCI build format silently drops the Dockerfile's `HEALTHCHECK` instruction with just a warning, no error.
- `podman compose up` — builds and runs via `compose.yaml`. Verified this does **not** need `--format docker`: going through the external `docker-compose` provider already produces a Docker-format image with `HEALTHCHECK` intact (confirmed by `podman inspect` reporting `healthy`). So the flag only matters for a bare `podman build`, not for compose.
- No image is published yet (`ghcr.io/<owner>/localscore` doesn't exist) — only local builds work right now.

Verified end-to-end (2026-07-08): both `podman build --format docker` + `podman run`, and `podman compose up`, produce a container `podman inspect` reports as `healthy`, with the API/frontend reachable and a full create-environment round trip working.

`DATA_DIR` (default `./data`) and `PORT` (default `8080`) are read from the environment; see `.env.example`.

### Container testing cleanup

When you `podman run` a container to manually verify something (health check, a route, a full rebuild), it's a temporary test artifact, not something to leave running or lying around:

- **Ask before deleting.** Once testing is done, tell the user what you're about to remove (container name, volume, image) and get a go-ahead before running `podman rm` / `podman rmi` / `podman volume rm` — don't delete silently, even though it's your own test container.
- **Clean up after yourself.** Stop and remove test containers/volumes when done (after confirmation), and run `podman image prune -f` after repeated `podman build` runs against the same tag — each rebuild orphans the previous image as a dangling `<none>` (this happened during initial Podman verification: 4 dangling images, ~1.5 GB, from 3 build iterations of the same `localscore:local` tag).

### Known gotchas

- **npm workspace hoisting affects the Dockerfile.** `npm ci` hoists shared dependencies to the workspace-root `node_modules`, not `server/node_modules` — the runtime image stage copies `/app/node_modules` (root), not a per-workspace one. If you add a server-only dependency that npm decides *not* to hoist (e.g. a conflicting version), the runtime COPY may need to also grab `server/node_modules` — check after `npm ci` whether it exists before assuming it doesn't.
- **`npm audit` reports 5 vulnerabilities** (3 moderate, 1 high, 1 critical) in the `vite`/`vitest`/`esbuild` dev-tooling chain (dev-server-only exposure, not a runtime/production risk). Fixing requires a breaking major-version bump to `vite`/`vitest` — left as-is; don't be surprised by it, and don't `npm audit fix --force` without deliberately taking that upgrade.
- **`podman compose build`/`up` can fail locally** with `error listing credentials - err: exec: "docker-credential-desktop": executable file not found` if `~/.docker/config.json` has `"credsStore": "desktop"` left over from Docker Desktop, even though Podman is what's actually running. Workaround for a one-off command: `DOCKER_CONFIG=<empty-dir-with-{}-config.json> podman compose ...`. Don't edit the user's real `~/.docker/config.json` to fix this — it's outside the project and outside this repo's concern.

## Source of truth

**`SPEC.md` is the full implementation contract.** Read it in its entirety before writing any code — it specifies the mandated tech stack (§3), data model (§4), the exact interview question catalog with metric mappings (§5), scoring rules (§2, §6), API surface (§8), container packaging (§9), and testing requirements (§10). Treat every MUST/MUST NOT in it as a hard requirement and every SHOULD as the default unless there is a documented reason to deviate. Do not improvise architecture that SPEC.md already decided.

## What this project is

localscore turns a CVSS base score into the score that actually applies to a specific environment. A vulnerability scanner reports a 10.0; CVSS environmental metrics can correct that for systems that aren't worst-case, but the official FIRST calculators are expert-facing. localscore asks ~12 plain-English questions about a "location" (e.g. "My Data Center", "Retail Kiosks") and derives CVSS environmental metric profiles from the answers, then applies those profiles to any pasted CVSS vector or looked-up CVE.

Self-hosted single container, SQLite on a volume, no accounts, no cloud dependency except an optional NVD CVE lookup.

## Mandated tech stack (SPEC.md §3)

- **Runtime**: Node 22 LTS, TypeScript everywhere, strict mode.
- **Backend**: Hono (Fastify only if Hono proves awkward) serving both the JSON API and the built frontend static assets from one process on one port (default 8080).
- **Frontend**: React + Vite, built to static assets at image build time. Plain CSS (custom properties for theming) or a tiny utility layer — no heavy UI framework, no large-runtime component library. Use the `frontend-design` skill for any UI/visual work — see "Frontend design" under Status.
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

## Domain rules for the scoring code

- CVSS v3.0 vectors are scored using v3.1 equations against the v3.1 profile, with a UI-visible disclosure — never silent (§2.5).
- v2.0 vectors (including bare `AV:N/AC:L/Au:N/...` syntax) get a friendly "not supported yet" rejection, not an attempted parse.
- If a pasted vector already contains environmental metrics, the environment profile's values win for metrics the profile defines; the vector's environmental values fill in the rest. UI should warn when this happens.
- Full metric-to-question mapping is in Appendix A of SPEC.md — consult it rather than re-deriving which question feeds which metric.
- The worked example in §6 (base `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = 9.8, "Disposable Dev Lab" profile → 0.0) MUST exist as an exact-match test case.

## API surface (SPEC.md §8)

All JSON under `/api`, no auth in v1, errors as `{ error: string }` with correct status codes. Frontend is served for all non-`/api` paths (SPA fallback to `index.html`) from the same process/port. See §8 for the full route table (`environments` CRUD + answers, `POST /api/score`, `GET /api/cve/:cveId`, `vulnerabilities` CRUD, `/api/health`, `/api/catalog`).
