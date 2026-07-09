# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

- Never commit directly to `main`. Before starting any work, create a new branch off `main` (branch off the latest `main`, not an existing feature branch).
- Before committing, always update documentation affected by the change — `CLAUDE.md` (Status, and whichever architecture section covers what changed), `README.md`, `API.md`, and `SPEC.md` if the change alters mandated behavior. Check each for now-stale claims (a feature described as "not built yet" that this change built, a route/shape that changed, a screen that didn't exist before) and fix them in the same commit as the code, not a follow-up. Do this as a deliberate last step prior to committing, not opportunistically while coding.
- When the work is done, commit the changes and push the branch to the remote.
- After pushing, generate a Markdown summary of the changes so the user can open the PR on GitHub manually — do not open the PR yourself. (This is manual for now; may be automated later.)
- **Any non-dev container build (i.e. a build meant to be published, not a local `localscore:local` verification build) MUST be tagged, pushed, and verified per "Publishing a release image" below** — never `podman push` an ad-hoc/untagged image or push only `latest`.

## Status

The product works end-to-end: an npm-workspaces monorepo (`server/` = Hono + better-sqlite3 API, `web/` = React + Vite frontend), the full interview catalog (SPEC.md §5.2), environment CRUD with answer-derivation, the initial DB migration, a working **scoring engine** (`POST /api/score`, `server/src/scoring/`), a real **frontend** (environments list → interview wizard → results screen with both a paste-a-vector flow and a CVE-lookup flow, plus a saved-vulnerabilities list, all wired to the API), **NVD CVE lookup** (`GET /api/cve/:cveId`, `server/src/lib/nvd.ts`), and **saved-vulnerability CRUD** (`server/src/routes/vulnerabilities.ts`). No remaining stubbed API routes and no remaining unbuilt UI surface for the routes above — see "Frontend" below for what's built and the one documented backend-shape gap it works around.

### NVD lookup & saved vulnerabilities

- `server/src/lib/nvd.ts` — fetches `services.nvd.nist.gov`, throttled module-wide (~1 req/6s unauthenticated, faster with `NVD_API_KEY`) since NVD's unauthenticated rate limit is shared across all callers in the process, not per-request. `extractVectorOptions()` parses every `cvssMetricV40`/`V31`/`V30` entry NVD returns (deliberately skips `cvssMetricV2` — v2 isn't a supported score) so the UI can show all disagreeing sources per SPEC.md §7; `pickPrimaryVector()` picks the highest-version/Primary-sourced one as the default.
- `GET /api/cve/:cveId` (`server/src/routes/cve.ts`) is cache-first against the `vulnerabilities` table (same table doubles as the NVD cache and the saved-vulnerability list, per SPEC.md §4's schema comment) — a cached CVE is served with no network call unless `?refresh=1`. A failed refresh falls back to serving the stale cache rather than erroring, per §7's offline behavior.
- `server/src/routes/vulnerabilities.ts` always re-parses and re-scores the vector server-side on save (`parseBaseVector` + `computeScore`) rather than trusting a client-supplied score — consistent with treating derived values as recomputed, not client state, elsewhere in the app.
- Tests mock global `fetch` via `vi.stubGlobal` (`server/test/cve-route.test.ts`); the throttle's module-level `lastRequestAt` needed a test-only reset hook (`__resetNvdThrottleForTests`) since otherwise it bleeds across unrelated test cases sharing the same process and causes spurious 5s+ timeouts.

### Frontend

`web/src/` — `App.tsx` does simple state-based view switching (`environments` / `interview` / `score` / `vulnerabilities`), no router library. `pages/` holds the four screens, `components/` the shared pieces (`SeverityPill`, `AnimatedScore`, `ScoreChanges`, `EnvironmentResultRow`, `ScoreResult`, `NvdVectorPicker`). `api.ts` wraps every `/api/*` call; `types.ts` mirrors the server's response shapes.

- `ScorePage.tsx` has two input modes (a segmented `.mode-toggle`, styled like the nav's `is-active` treatment): paste-a-vector (unchanged) and look-up-a-CVE. The CVE mode shows a cached/fresh indicator with a Refresh action, and — when NVD returns more than one disagreeing CVSS entry (per SPEC.md §7) — a picker built from the interview page's existing `.option-card` selectable-card pattern rather than inventing a new one. Both modes render through the shared `ScoreResult` component.
- `ScoreResult.tsx` (extracted from what used to be inline in `ScorePage.tsx`) renders the base-score-card + per-environment result list, and optionally an inline-expand "Save" action (`onSave` prop) that POSTs to `/api/vulnerabilities`. Omitting `onSave` hides the control — used when viewing an already-saved item from `SavedVulnerabilitiesPage.tsx`.
- `SavedVulnerabilitiesPage.tsx` lists saved vulnerabilities (mirrors `EnvironmentsPage.tsx`'s list/empty-state/delete structure) with inline expand-to-view-and-rescore per row via `ScoreResult`. Each `<li>` is one `.card.vulnerability-row` containing both the clickable header and the conditionally-rendered detail panel (reuses `.result-row-detail`'s divider treatment from `EnvironmentResultRow.tsx`) — not a header card with a separate unstyled sibling — so the expanded content stays visibly bounded within its own card. Clicking anywhere on the header row toggles expand/collapse (`onClick` on `.vulnerability-row-header`); the View/Hide and Delete buttons inside it call `event.stopPropagation()` so they don't also re-trigger the row's own toggle. `SeverityPill` takes an optional `variant?: "solid" | "outline"` (default `"solid"`) — this page uses `"outline"` (border + text colored by severity, transparent fill) instead of the usual solid pill, since a solid pill here would carry the same visual weight as the neutral `.badge` tags next to it. The outline variant's colors are separate `--severity-*-text` tokens (root + dark-mode override, alongside the existing `--severity-*` fill tokens), not the raw fill hues — validated via the dataviz skill's `validate_palette.js` plus WCAG contrast math that e.g. `--severity-medium` measures only 1.79:1 as raw text against the light surface (fill-with-near-black-text and text-on-surface are different contrast pairings, and the fill tokens were only ever validated for the former).
- **Known gap, by design**: `POST /api/vulnerabilities` doesn't accept/store the raw NVD JSON blob, so a vulnerability saved from a CVE lookup won't show the `NvdVectorPicker` on its saved-vulnerabilities detail view until that CVE ID is separately re-looked-up through the Score page (which is what upserts the `nvd_json` cache column). Accepted as a documented limitation rather than expanding `vulnerabilities.ts`'s scope for this UI-only slice of work.
- `web/src/lib/severity.ts` — `nvdSeverityToAppSeverity(raw, baseScore)` maps NVD's upper-case `baseSeverity` strings (or the score-band fallback when NVD omits one) onto the app's title-case `Severity` union; also reused to score-derive a severity pill for the saved-vulnerabilities list, which doesn't carry `baseSeverity` at all.

Design system lives in `web/src/styles.css` as CSS custom properties (no framework, per SPEC.md §3): IBM Plex Mono for headlines/scores/vector strings, Archivo for body copy (via `@fontsource/*`, self-hosted — **never** load fonts from a CDN, SPEC.md requires the app work fully offline). Import only the `latin-*.css` subset files from `@fontsource` packages, not the bare weight files — the latter pull in every unicode subset (cyrillic, vietnamese, greek, ...) and roughly quadruple the font payload for no reason in an English-only UI.

The results screen's signature interaction: each environment's score animates from the base score to its modified score on load (`AnimatedScore`), with color morphing through the severity scale in transit — the "a 10 might actually be a zero" moment, dramatized once. Respects `prefers-reduced-motion`. `None` severity deliberately renders with no color at all (quiet muted text, no pill) rather than a fifth hue — see "Frontend design" below for why. The severity pill next to the animated number derives its severity from the same live (in-transit) value as the number's color, not the final value — both must land together when the animation settles, or the pill spoils the reveal by snapping to its end state early.

Each changed-metric line in the "why" panel (`ScoreChanges.tsx`) shows a colored ▲/▼/– glyph plus a real signed score number (e.g. `-1.3`, `±0.0`) sourced from the server's `ScoreChange.impact`/`direction` fields, plus a closing "Total:" line and a small order-dependency caveat. Exact per-metric numeric attribution isn't inherently well-defined for CVSS (the formula isn't additive), so `impact` is a **sequential/waterfall** figure: `applyEnvironment()` applies each change one at a time and measures the score movement at each step, which means the per-line numbers always telescope exactly to the row's total delta (reassuring when a user asks "how did three items add up to +1.6?") even though the *split* between two interacting changes could differ if the application order changed — see `server/src/scoring/index.ts`. `direction` is simply derived from `impact`'s sign (`worse`/`better`/`neutral`), not a separate ordinal judgment. The severity pill (in both `AnimatedScore` and the base-score-card) sits in a fixed-width `.severity-slot` sized to the longest severity word ("CRITICAL") so score figures stay aligned in a column down a result list regardless of which severity word appears per row — `.pill-none`'s chrome-less rendering still fits the same slot.

### Scoring engine

Built on `ae-cvss-calculator` (metaeffekt, Apache-2.0, zero runtime deps, covers CVSS 2.0/3.0/3.1/4.0) after evaluating it per SPEC.md §2.4 — reproduces the spec's worked example (base `9.8` → environmental `0.0`) and known reference vectors exactly; see `server/test/scoring.test.ts`. It's a CommonJS package under `"type": "module"` — import it with `import pkg from "ae-cvss-calculator"; const { Cvss3P1, Cvss4P0 } = pkg;`, not named imports (TS's `NodeNext` resolution will reject named imports from a CJS package).

- `server/src/scoring/parse.ts` — version detection/routing (§2.5) and friendly parse errors. Note: `AV:X` is *not* an invalid value — `X` is the real "Not Defined" enum member shared by every metric — so it's caught separately as "missing required base metrics" via `isBaseFullyDefined()`, not as an unknown-value error.
- `server/src/scoring/orderings.ts` — the §2.2 cap severity orderings (only the exploitability metrics that ever carry a `cap` effect: AV/AC/AT/PR/UI), and `baseCounterpartMetric()` (strip a leading `M` — works uniformly for every M-prefixed metric, cap or override; CR/IR/AR and the v4 supplemental metrics have no base counterpart). An earlier version of this file also carried a symbolic `severityDirection()` covering every scoring-relevant metric to power the "why" panel's ▲/▼ indicators — removed in favor of `applyEnvironment()` computing the real score impact directly (see below), which is strictly more accurate and needed no CR/IR/AR-style special-casing.
- `server/src/scoring/index.ts` — `applyEnvironment()` (mutates a parsed vector per override/cap rules; also tracks a running score across the mutation loop so each returned `AppliedChange` carries a real `impact` — the score movement caused by that change on top of everything already applied before it — and a `direction` derived from `impact`'s sign) and `scoreForEnvironment()` (parse + apply + compute in one call).
- `server/src/catalog/derive.ts` — `DerivedMetric` now carries `questionId`/`optionId` provenance (used for change explanations), in addition to what's persisted to `environment_metrics`.
- `POST /api/score` recomputes each environment's derived metrics fresh from `environment_answers` at request time rather than reading the persisted `environment_metrics` cache — simpler and self-consistent, at negligible cost (12 questions).
- `Question` (`server/src/catalog/types.ts`) has an optional `finePrint` field for the SPEC.md §5.2-mandated "what this maps to" disclosures on Q1 (reachability→MAV:A is an approximation, not literal CVSS Adjacent) and Q4 (CVSS has no "interaction impossible" value, so the cap only reduces to the hardest interaction level). `InterviewPage.tsx` renders it as a collapsed `<details class="fine-print">` under the question's `whyWeAsk` text, so it stays out of the way for non-expert users. `server/test/environments-route.test.ts` covers environment CRUD, resumable partial-answer saves, and metric re-derivation-on-save (§10.6) — previously only exercised incidentally as fixture setup inside `score-route.test.ts`.

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
- Published image: `docker.io/eengelking/localscore` (tags `latest`, `0.1.0`) — pushed with `podman push`. SPEC.md §9's example commands reference `ghcr.io/<owner>/localscore`; the maintainer chose Docker Hub instead, so README.md documents `docker.io/eengelking/localscore` as the real, working registry path. See "Publishing a release image" below for the required tag/push/verify procedure — never push an untagged or `latest`-only build.

Verified end-to-end (2026-07-08): both `podman build --format docker` + `podman run`, and `podman compose up`, produce a container `podman inspect` reports as `healthy`, with the API/frontend reachable and a full create-environment round trip working.

`DATA_DIR` (default `./data`) and `PORT` (default `8080`) are read from the environment; see `.env.example`.

### Testing during development vs. before merge

Two distinct testing procedures — don't conflate them:

- **Test 2 (npm, during development)** — the default while iterating. Build and run the built server directly on port 8081 (`PORT=8081`), not the Vite dev server: `npm run build && PORT=8081 node server/dist/index.js`. This matches how the container actually runs (one process, built frontend + API) without the overhead of a full container build on every check. **Always stop the process cleanly when done** (kill it — don't leave it running in the background between tasks). Use this for functional checks, API round trips, and UI verification via Playwright (see "Verifying frontend changes" above) throughout the work.
- **Test 1 (container, last step before merge)** — the final gate confirming the container builds and runs as it will in production, on port 8080. Container name `localscore-test`, image tag `localscore:local`. Before building: check whether a container named `localscore-test` (or anything else) is already bound to port 8080 — if so, **ask the user before taking it down**, don't stop it unilaterally. Always build a fresh image (don't reuse a stale one) — `podman build --format docker -t localscore:local .` — then `podman run --name localscore-test -p 8080:8080 ...` and confirm `/api/health` reports healthy and the frontend loads. Clean up afterward per "Container testing cleanup" below (ask before removing).

### Publishing a release image

This is separate from Test 1 (which only builds `localscore:local` for local verification and is never pushed). A release build is any container image meant to be published to `docker.io/eengelking/localscore`.

1. **Decide the version bump.** Current version lives in the root `package.json` (`server/package.json` and `web/package.json` are kept in sync with it — bump all three together). Default to a **patch or minor bump** from the prior published tag (e.g. `0.1.0` → `0.1.1` or `0.2.0`) for normal releases. Only bump the **major** version (`0.x.y` → `1.0.0`) when the user has explicitly said this is a major/breaking release — never infer "major" on your own from the diff size. If it's ambiguous which bump applies, ask the user rather than guessing.
2. **Update the version** in `package.json`, `server/package.json`, `web/package.json` to the new version number, and update any docs that literally quote the current published tag (README.md's image line, CLAUDE.md's "Published image" line below) so they don't go stale.
3. **Build fresh** — don't reuse a stale local image: `podman build --format docker -t localscore:<new-version> .` (`--format docker` is required for the `HEALTHCHECK` to survive, per the gotcha above).
4. **Tag** the built image for the registry with both the new version and `latest`:
   - `podman tag localscore:<new-version> docker.io/eengelking/localscore:<new-version>`
   - `podman tag localscore:<new-version> docker.io/eengelking/localscore:latest`
5. **Push both tags**:
   - `podman push docker.io/eengelking/localscore:<new-version>`
   - `podman push docker.io/eengelking/localscore:latest`
6. **Verify the push succeeded** — don't just trust a clean exit code from `podman push`. Confirm the new tag is actually live on the registry, e.g. `podman manifest inspect docker.io/eengelking/localscore:<new-version>` (or `skopeo inspect docker://docker.io/eengelking/localscore:<new-version>` if available) and check that `latest` now resolves to the same digest as `<new-version>`.
7. Clean up the local release build per "Container testing cleanup" below (ask before removing) once the push is verified.

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
