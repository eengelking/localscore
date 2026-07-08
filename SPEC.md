# localscore — Specification v1.0

A self-hosted, containerized web tool that turns CVSS base scores into **environmentally adjusted scores** for the user's actual locations. Users describe each location ("My Data Center", "Retail Kiosks", "Dev Lab") through a plain-language interview; the tool converts the answers into CVSS environmental metric profiles. Pasting a CVSS vector (or looking up a CVE ID) then shows the **modified score per location, side by side** — the real risk, not the worst-case base score.

This document is the implementation contract. Agents building the tool should treat every **MUST/MUST NOT** as a hard requirement and every **SHOULD** as the default unless there is a documented reason to deviate.

---

## 1. Problem & goals

CVSS base scores describe a vulnerability's worst-case potential against a target that has everything to lose. They assume the system is reachable as scored, holds confidential data, must stay unmodified, and must stay up. Most real systems fail at least one of those assumptions. The CVSS spec provides environmental metrics to correct for this, but the official FIRST calculators are expert-facing and almost nobody uses them.

**Goals**

1. A novice with no CVSS knowledge can describe a location by answering ~12 plain-English questions.
2. Each location becomes a persistent **environment profile** (Modified Base metrics + Security Requirements + applicable Supplemental metrics), derived for **both CVSS v4.0 and v3.1** from the same interview.
3. The user pastes any CVSS v4.0 / v3.1 / v3.0 vector — or enters a CVE ID for an optional NVD lookup — and sees the base score plus the **environmentally modified score for every profile**, with a per-profile explanation of exactly which answers changed which metrics.
4. Ships as a **single container image** with a SQLite database on a bind mount / volume. Fully functional offline (NVD lookup is the only optional network call).

**Non-goals for v1** (see Roadmap, §11): CVSS v2.0 scoring; multi-user auth (single-operator, self-hosted, trusted network); automated threat/temporal metrics; scanner integrations; report exports.

---

## 2. Domain rules (correctness constraints)

These are the subtle parts. Implementers MUST follow them.

### 2.1 What an environment profile can and cannot contain

| Metric group | Per-environment? | Handling |
|---|---|---|
| Modified Base — v4.0: MAV MAC MAT MPR MUI MVC MVI MVA MSC MSI MSA; v3.1: MAV MAC MPR MUI MS MC MI MA | Yes | Derived from interview answers |
| Security Requirements — CR IR AR (both versions) | Yes | Derived from interview answers |
| Supplemental (v4.0) — S, R, V, RE | Yes | Derived from interview; **display-only, MUST NOT change any score** (per CVSS v4.0 spec §6) |
| Supplemental (v4.0) — AU (Automatable), U (Provider Urgency) | **No** | Per-vulnerability / provider-assigned, not environmental. Displayed read-only if present in a pasted vector; never interviewed |
| Threat (v4.0: E) / Temporal (v3.1: E, RL, RC) | **No** | Per-vulnerability, not per-environment (whether an exploit exists doesn't depend on your data center). Displayed read-only if present in a pasted vector and included in the score math as pasted. A per-vulnerability "known exploited?" prompt is a roadmap item |

### 2.2 Cap vs. override semantics

Every metric effect emitted by an interview option is declared as either:

- **`override`** — always replace the base metric with this value. Used when the environment makes the metric's value a fact regardless of the vulnerability, e.g. CR/IR/AR (pure environment properties), or MVC:N when the location genuinely holds nothing confidential.
- **`cap`** — apply **only if it makes the metric less severe** than the base value; otherwise leave Not Defined. Used when the environment limits worst-case exposure but must never make a vulnerability look *more* exposed than it already is. Example: an air-gapped network caps AV:N → MAV:A, but a vulnerability that is already AV:L MUST NOT be raised to MAV:A.

Severity orderings for cap comparisons (most → least severe):

| Metric | Ordering |
|---|---|
| AV / MAV | N > A > L > P |
| AC / MAC | L > H |
| AT / MAT (v4) | N > P |
| PR / MPR | N > L > H |
| UI / MUI (v4) | N > P > A |
| UI / MUI (v3.1) | N > R |
| VC/VI/VA, C/I/A and their M-forms | H > L > N |
| SC and MSC (v4) | H > L > N |
| SI/SA and MSI/MSA (v4) | S > H > L > N |

Exception: raising Subsequent-system impact (Q8 "blast radius" and Q9 "safety") is a deliberate, legitimate `override` that MAY increase a score above base — that is the entire point of environmental scoring for well-connected or safety-critical locations.

### 2.3 Not Defined passes through

Any question answered "Skip / not sure", and any metric a question does not touch, remains **Not Defined (X)**, meaning the base metric value is used unchanged in the environmental calculation. An empty profile MUST reproduce the base score exactly (this is a required test, §10).

### 2.4 Scoring math must match FIRST

All score computation MUST produce results identical to FIRST's reference calculators:

- v4.0: https://www.first.org/cvss/calculator/4.0 (MacroVector-based scoring per the official `cvss-v4-calculator` reference implementation)
- v3.1: https://www.first.org/cvss/calculator/3.1 (environmental equations per the v3.1 spec, including the Roundup function)

Use an existing maintained TypeScript library — `ae-cvss-calculator` (metaeffekt; covers 2.0/3.x/4.0) is the leading candidate — or vendor FIRST's official reference code. Evaluate the chosen library against the reference test vectors (§10) before committing to it. **Hand-rolled scoring math without reference-validated test vectors is not acceptable.**

Severity bands (both versions): 0.0 None · 0.1–3.9 Low · 4.0–6.9 Medium · 7.0–8.9 High · 9.0–10.0 Critical.

### 2.5 Version handling

- `CVSS:4.0/` → v4.0 math against the profile's v4.0 metric set.
- `CVSS:3.1/` → v3.1 math against the profile's v3.1 metric set.
- `CVSS:3.0/` → scored with v3.1 math against the v3.1 profile, with a visible note ("scored using v3.1 equations"). The differences between 3.0 and 3.1 equations are minor (Roundup definition, MISS ceiling in one branch); this simplification MUST be disclosed in the UI, not silent.
- Anything else (including `CVSS:2.0` and bare v2 vectors like `AV:N/AC:L/Au:N/...`) → friendly rejection explaining v2 is not yet supported.

If a pasted vector already contains environmental metrics, the environment profile's values take precedence for the metrics the profile defines; the vector's environmental values fill the rest. The UI SHOULD warn that the pasted vector contained environmental metrics.

---

## 3. Tech stack (mandated)

- **Runtime**: Node 22 LTS, TypeScript everywhere (strict mode).
- **Backend**: Hono (or Fastify if Hono proves awkward) serving the JSON API **and** the built frontend static assets from one process on one port (default **8080**).
- **Frontend**: React + Vite, built to static assets at image build time. Plain CSS (custom properties for theming) or a tiny utility layer. No heavy UI framework, no component library with a large runtime.
- **Database**: SQLite via `better-sqlite3`, single file at `/data/localscore.db`. WAL mode. Migrations as sequential numbered SQL files (`migrations/0001_*.sql`, …) applied at startup inside a transaction; applied migrations tracked in a `schema_migrations` table.
- **Scoring**: per §2.4.
- **Testing**: Vitest.
- **Container**: per §9.

No external services. No telemetry. The only outbound network call is the optional NVD lookup (§7).

---

## 4. Data model

```sql
environments (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,     -- "My Data Center"
  description   TEXT NOT NULL DEFAULT '',
  catalog_version TEXT NOT NULL,          -- interview catalog version answers were given against
  created_at    TEXT NOT NULL,            -- ISO 8601
  updated_at    TEXT NOT NULL
)

-- Raw interview answers: source of truth. Metrics are re-derived from these,
-- so the catalog can evolve and environments can be re-opened and edited.
environment_answers (
  environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL,           -- e.g. "reachability"
  option_id      TEXT NOT NULL,           -- e.g. "internal_only"
  PRIMARY KEY (environment_id, question_id)
)

-- Derived metric effects, materialized on save for fast scoring.
environment_metrics (
  environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  cvss_version   TEXT NOT NULL CHECK (cvss_version IN ('4.0','3.1')),
  metric         TEXT NOT NULL,           -- 'MAV', 'CR', 'S', ...
  value          TEXT NOT NULL,           -- 'A', 'H', 'P', ...
  effect         TEXT NOT NULL CHECK (effect IN ('override','cap')),
  PRIMARY KEY (environment_id, cvss_version, metric)
)

-- Saved vulnerabilities and the NVD cache.
vulnerabilities (
  id          INTEGER PRIMARY KEY,
  label       TEXT NOT NULL,              -- user label or CVE ID
  source      TEXT NOT NULL CHECK (source IN ('vector','nvd')),
  cve_id      TEXT,                       -- NULL for pasted vectors
  vector      TEXT NOT NULL,              -- the vector chosen for scoring
  cvss_version TEXT NOT NULL,
  base_score  REAL NOT NULL,
  nvd_json    TEXT,                       -- raw NVD API response, cached
  fetched_at  TEXT,
  created_at  TEXT NOT NULL
)
```

The **question catalog lives in code** (a versioned TypeScript module, §5), not in the database. `environment_answers` + `catalog_version` let the app re-derive `environment_metrics` when the catalog changes, and let the UI re-open a completed interview with previous answers pre-selected.

---

## 5. Interview design & question catalog

This is the heart of the product. One interview, ~12 questions, each option emitting metric effects for **both** v4.0 and v3.1. The tone is a colleague asking about the site, never CVSS jargon; metric names appear only in optional "what this maps to" fine print for curious users.

### 5.1 Catalog data shape

```ts
interface Question {
  id: string;
  order: number;
  question: string;        // plain English
  whyWeAsk: string;        // one or two sentences of help text
  options: Option[];       // each also gets an implicit "Skip / not sure" -> no effects
}
interface Option {
  id: string;
  label: string;           // short answer text
  description?: string;    // clarifying examples
  effects: MetricEffect[]; // empty array = Not Defined
}
interface MetricEffect {
  version: '4.0' | '3.1';
  metric: string;          // 'MAV', 'CR', 'S', ...
  value: string;
  effect: 'override' | 'cap';
}
export const CATALOG_VERSION = '1.0';
```

### 5.2 The v1 question catalog

Every question implicitly includes a final option **"Skip — not sure / doesn't apply"** with no effects (metrics stay Not Defined). Wording below is the spec; implementers may polish phrasing but MUST NOT change the metric effects without updating this document.

---

**Q1 · `reachability` — "How could an outsider reach the systems at this location?"**
*Why we ask: a vulnerability that's exploitable "from the internet" only matters that way if the internet can actually reach you.*

| Option | Description | Effects |
|---|---|---|
| Directly from the internet | Public services, cloud instances with public IPs, anything an outsider can hit | none |
| Only from inside our network | Reaching these systems first requires being on the internal network or VPN | v4 `MAV=A cap` · v3.1 `MAV=A cap` |
| No network path at all | Air-gapped or console-only; you must physically be at the machine | v4 `MAV=P cap` · v3.1 `MAV=P cap` |

*Note for implementers: "internal only → MAV:A" is a documented approximation — CVSS defines AV:A as adjacent (shared link/logical network), and we use it to express "the attacker must first gain a foothold on our network." State this in the fine print.*

---

**Q2 · `network_protections` — "Is there anything extra an attacker would have to get through before touching these systems?"**
*Why we ask: layered defenses in front of a system make otherwise-easy attacks conditional on defeating those layers first.*

| Option | Description | Effects |
|---|---|---|
| Nothing beyond the basics | Standard firewall rules, nothing special | none |
| Yes — meaningful extra layers | Jump host / bastion with MFA, strict allow-listing, network segmentation, application gateway in front | v4 `MAT=P cap` · v3.1 `MAC=H cap` |

---

**Q3 · `accounts` — "Who can actually log in to or use these systems?"**
*Why we ask: many exploits assume no account is needed. If everything here sits behind authentication, unauthenticated attacks get harder in practice.*

| Option | Description | Effects |
|---|---|---|
| Anyone — no login needed | Public or anonymous access to the services in question | none |
| A valid user account is required | Every service requires standard-user authentication first (e.g., behind an authenticating proxy/SSO) | v4 `MPR=L cap` · v3.1 `MPR=L cap` |
| Administrators only | Only privileged/admin staff can access these systems at all | v4 `MPR=H cap` · v3.1 `MPR=H cap` |

*Fine print: this cap models access mediated by an auth layer in front of the vulnerable component. If a service is directly exposed without that layer, answer "Anyone."*

---

**Q4 · `human_use` — "Do people actively work on these systems — opening links, files, or email on them?"**
*Why we ask: many attacks need a human to click something. Headless servers don't click.*

| Option | Description | Effects |
|---|---|---|
| Yes — people use them interactively | Workstations, kiosks, terminals people browse/read mail on | none |
| No — headless / unattended | Servers, appliances; no one browses or opens files on them | v4 `MUI=A cap` · v3.1 `MUI=R cap` |

*Fine print: CVSS has no value for "user interaction impossible," so this caps interaction-dependent exploits at the hardest interaction level the spec allows. It cannot zero them out.*

---

**Q5 · `confidentiality` — "If an attacker could read everything on these systems, how bad would that actually be?"**
*Why we ask: a "steals all your data" vulnerability only matters if there's data worth stealing.*

| Option | Description | Effects |
|---|---|---|
| Catastrophic | Regulated data, customer PII, credentials/secrets, trade secrets | v4+v3.1 `CR=H override` |
| Painful but survivable | Internal business data; embarrassing, not existential | v4+v3.1 `CR=M override` |
| Barely matters | Nothing sensitive lives here | v4+v3.1 `CR=L override` |
| There is genuinely nothing to read | Synthetic/test data only; rebuilt from a pipeline; no secrets ever touch it | v4 `CR=L override` + `MVC=N override` · v3.1 `CR=L override` + `MC=N override` |

---

**Q6 · `integrity` — "If an attacker could silently change anything on these systems, how bad would that be?"**
*Why we ask: same idea as the last question, but for tampering instead of theft.*

| Option | Description | Effects |
|---|---|---|
| Catastrophic | Changes here corrupt money, safety decisions, or downstream systems | v4+v3.1 `IR=H override` |
| Painful but survivable | We'd have to clean up, but damage is contained | v4+v3.1 `IR=M override` |
| Barely matters | Nothing here needs to stay pristine | v4+v3.1 `IR=L override` |
| Nothing needs to stay unmodified | Disposable; any change is wiped on the next automated rebuild | v4 `IR=L override` + `MVI=N override` · v3.1 `IR=L override` + `MI=N override` |

---

**Q7 · `availability` — "If these systems went down right now, who would care, and how fast?"**
*Why we ask: an outage on a system nobody depends on is not the same as an outage on the checkout flow.*

| Option | Description | Effects |
|---|---|---|
| Immediate serious impact | Revenue, operations, or safety depends on uptime | v4+v3.1 `AR=H override` |
| Annoying within a day or two | People would notice and grumble; work continues | v4+v3.1 `AR=M override` |
| Barely matters | Days of downtime would be fine | v4+v3.1 `AR=L override` |
| Nobody would notice | Auto-rebuilt / redundant / idle; downtime is invisible | v4 `AR=L override` + `MVA=N override` · v3.1 `AR=L override` + `MA=N override` |

---

**Q8 · `blast_radius` — "If an attacker fully controlled one of these systems, could they reach or damage other important systems from it?"**
*Why we ask: a compromised low-value box on a flat network with your crown jewels is not a low-value compromise.*

| Option | Description | Effects |
|---|---|---|
| Yes — it's a stepping stone to critical systems | Shared credentials, flat network, manages or talks to critical infrastructure | v4 `MSC=H override`, `MSI=H override`, `MSA=H override` · v3.1 `MS=C override` |
| Normal connectivity | Typical network position, nothing special either way | none |
| No — a dead end | Isolated segment; nothing meaningful is reachable from it | v4 `MSC=N override`, `MSI=N override`, `MSA=N override` · v3.1 `MS=U override` |

*This is the question that can legitimately push a score **above** its base — that is intended (§2.2).*

---

**Q9 · `safety` — "Could tampering with or crashing these systems physically endanger anyone?"**
*Why we ask: medical devices, industrial control, vehicles, building systems — when software failure can hurt people, the score should reflect it.*

| Option | Description | Effects |
|---|---|---|
| Yes | OT/ICS, medical, vehicular, life-safety-adjacent systems | v4 `S=P override` (supplemental) + `MSI=S override`, `MSA=S override` |
| No | Failure here is a purely digital problem | v4 `S=N override` (supplemental) |

*v3.1 has no safety concept; this question emits no v3.1 effects. The MSI/MSA Safety override outranks Q8's values when both are answered (see §5.3).*

---

**Q10 · `recovery` — "After a serious compromise or crash, how does this location get back to normal?"** *(v4 supplemental, display-only)*

| Option | Effects |
|---|---|
| Automatically — rebuilt from pipeline/IaC, restores itself | `R=A override` |
| Manually — documented process, people do the work | `R=U override` |
| Uncertain — we'd be improvising, or we'd need outside help | `R=I override` |

---

**Q11 · `value_density` — "Does one system here control a lot of resources, or is each box just one small piece?"** *(v4 supplemental, display-only)*

| Option | Effects |
|---|---|
| Concentrated — one system = many resources (hypervisor, DB server, domain controller) | `V=C override` |
| Diffuse — each system is one small unit of a larger whole | `V=D override` |

---

**Q12 · `patch_effort` — "How disruptive is it to patch or update systems at this location?"** *(v4 supplemental Vulnerability Response Effort, display-only)*

| Option | Effects |
|---|---|
| Easy — routine, low-risk, quick | `RE=L override` |
| Moderate — scheduling, testing, some coordination | `RE=M override` |
| Hard — downtime windows, vendor involvement, regulatory hoops | `RE=H override` |

---

### 5.3 Derivation rules

- On interview save: clear the environment's `environment_metrics` rows and re-derive from answers, in question order. **Conflict rule**: if two questions write the same metric, the later question's `override` wins over earlier values; a `cap` never displaces an existing `override`. Concretely: Q9 Safety (`MSI=S`, `MSA=S`) overrides Q8's blast-radius values for those metrics.
- Supplemental S, R, V, RE are stored like other metrics but flagged by the scoring layer as non-scoring; they render as context chips on results.
- The interview MUST be resumable (answers persist per question) and re-openable for editing with prior answers pre-selected.

---

## 6. Scoring & results flow

1. **Input**: a paste box accepting a raw vector, and a CVE ID field (§7). Vector version detection per §2.5. Parse errors MUST be specific and friendly ("`AV:X` isn't a valid Attack Vector value — expected N, A, L, or P"), never a stack trace.
2. **Compute per environment**: for each environment with an interview completed for the vector's version:
   - Start from the base vector's metrics.
   - Apply each stored effect: `override` → set the M-metric/requirement; `cap` → set only if less severe than base (per §2.2 orderings).
   - Compute the environmental score with the version-appropriate reference math.
3. **Results screen**:
   - Top: the base score, severity band, version badge, and the normalized vector string.
   - Table: one row per environment — name, **modified score**, severity band (color-coded), delta vs. base (e.g. `−9.8`), sorted by modified score descending.
   - Each row expands to a "why" panel: every metric that changed, shown as `Attack Vector: Network → Adjacent — because you answered "Only from inside our network"` (question/answer text, not metric codes, with codes in fine print). Supplemental context chips (Safety, Recovery, …) render here.
   - Environments lacking an interview for that version show "no profile yet" with a link to the interview, not a fake score.
4. Scored vulnerabilities MAY be saved (with a label) for re-display; saving is optional, scoring works without it.

**Worked example (MUST appear as a test case, §10):** base vector `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = **9.8 Critical**. Environment "Disposable Dev Lab" answered: internal-only (MAV:A cap), nothing to read (CR:L, MC:N), nothing to keep unmodified (IR:L, MI:N), nobody would notice downtime (AR:L, MA:N), dead-end network (MS:U). Modified impact sub-score is 0 → **environmental score 0.0, None**. The blog post's "a 10 might actually be a zero," demonstrated.

---

## 7. NVD lookup (optional, online-only)

- Endpoint: `GET https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-XXXX-XXXXX`. No API key required; unauthenticated rate limits are low (~5 requests/30s), so the client MUST throttle and MUST cache every successful response in `vulnerabilities.nvd_json`. Support an optional `NVD_API_KEY` env var for the higher authenticated limit.
- If NVD returns multiple CVSS entries (e.g., NVD's v3.1 + a CNA's v4.0 + a secondary source), present all of them with their **source and version** and let the user choose which vector to score — this mirrors the blog post's CVE-2026-55200 example where three scores disagree.
- Offline / failure behavior: a clear message ("Couldn't reach NVD — paste the CVSS vector directly instead") with the paste box focused. A cached CVE MUST be served from cache without a network call (with its `fetched_at` shown and a refresh option).
- Timeouts short (≤10s); the UI never hangs on NVD.

---

## 8. API surface

All JSON, all under `/api`. No auth in v1 (§1 non-goals). Errors as `{ error: string }` with correct status codes.

| Route | Purpose |
|---|---|
| `GET /api/health` | Container healthcheck: 200 + `{ ok: true, db: true }` |
| `GET /api/catalog` | The interview question catalog + `CATALOG_VERSION` |
| `GET /api/environments` | List environments with interview-completion status per version |
| `POST /api/environments` | Create (name, description) |
| `GET /api/environments/:id` | Detail incl. answers and derived metrics |
| `PUT /api/environments/:id` | Rename / edit description |
| `PUT /api/environments/:id/answers` | Save interview answers (partial OK — resumable); server re-derives metrics |
| `DELETE /api/environments/:id` | Delete (cascade) |
| `POST /api/score` | Body `{ vector }` → parsed base result + per-environment modified results with change explanations |
| `GET /api/cve/:cveId` | NVD lookup (cache-first) → available vectors with sources |
| `GET/POST/DELETE /api/vulnerabilities[...]` | Saved-vulnerability CRUD |

The frontend is served for all non-`/api` paths (SPA fallback to `index.html`).

---

## 9. Container & operations

- **Multi-stage Dockerfile**: build stage (install deps, build frontend + backend, prune dev deps) → runtime stage on `node:22-slim` (or alpine, whichever `better-sqlite3` prebuilds support cleanly). Runs as a non-root user. Final image SHOULD be < 300 MB.
- Port **8080** (`PORT` env var to override). Data directory `/data` (`DATA_DIR` to override); the app creates the DB file and runs migrations on boot. If `/data` isn't writable, fail fast with a clear log message about mounting a volume.
- `HEALTHCHECK` wired to `/api/health`.
- Documented run commands (these go in the README verbatim):

```bash
docker run -d --name localscore -p 8080:8080 -v localscore-data:/data ghcr.io/<owner>/localscore:latest
# or with a bind mount:
docker run -d --name localscore -p 8080:8080 -v "$PWD/data:/data" ghcr.io/<owner>/localscore:latest
```

plus an equivalent `compose.yaml`. Graceful shutdown on SIGTERM (close DB, drain server).

---

## 10. Testing requirements

Vitest; tests are a release gate.

1. **Reference score parity** — table-driven vectors with expected scores validated against FIRST's v4.0 and v3.1 calculators: base-only vectors across all severity bands; environmental permutations (each M-metric individually, CR/IR/AR at each level, combined profiles); v4 vectors with threat metric E; the worked example from §6 (9.8 → 0.0) exactly.
2. **Empty-profile identity** — an environment with zero answers reproduces the base score bit-for-bit for both versions.
3. **Cap/override behavior** — both directions for every cap in the catalog (e.g., AV:L base + air-gapped answer stays AV:L; AV:N base becomes MAV:A). Conflict rule: Q9 Safety overriding Q8's MSI/MSA.
4. **Catalog integrity** — every option's effects reference valid metrics/values for the declared version; every scoring-relevant metric in §2.1 is touched by at least one option or documented as intentionally uncollected (AU, U, threat/temporal); supplemental effects never alter a computed score.
5. **Parsing** — valid vectors of each version; malformed vectors produce the specific friendly errors; v2 vectors produce the not-supported message; vectors containing environmental metrics trigger the §2.5 precedence behavior.
6. **API** — environment CRUD, resumable answers, re-derivation on catalog re-save, `POST /api/score` shape, NVD offline fallback (mock fetch), cache-first CVE lookup.

---

## 11. Roadmap (documented, not built in v1)

- CVSS **v2.0** scoring + a v2 branch of the interview mapping (older CVEs still carry v2-only scores).
- Per-vulnerability **threat metrics**: "is there a known exploit?" prompt, optionally auto-checked against CISA KEV.
- Export scored results (CSV/JSON) and shareable report view.
- Environment **cloning** ("like My Data Center, but…").
- Side-by-side multi-vector comparison for one CVE (NVD vs. CNA vs. v4), extending the §7 picker.
- Optional basic auth for non-trusted-network deployments.

---

## Appendix A — metric coverage matrix

| Metric | Version | Collected by | Effect type |
|---|---|---|---|
| MAV | 4.0 / 3.1 | Q1 | cap |
| MAC | 3.1 | Q2 | cap |
| MAT | 4.0 | Q2 | cap |
| MPR | 4.0 / 3.1 | Q3 | cap |
| MUI | 4.0 / 3.1 | Q4 | cap |
| MVC / MC | 4.0 / 3.1 | Q5 (extreme option) | override |
| MVI / MI | 4.0 / 3.1 | Q6 (extreme option) | override |
| MVA / MA | 4.0 / 3.1 | Q7 (extreme option) | override |
| MSC | 4.0 | Q8 | override |
| MSI / MSA | 4.0 | Q8, Q9 (safety wins) | override |
| MS | 3.1 | Q8 | override |
| CR / IR / AR | 4.0 / 3.1 | Q5 / Q6 / Q7 | override |
| S (Safety, supplemental) | 4.0 | Q9 | override (display-only) |
| R (Recovery, supplemental) | 4.0 | Q10 | override (display-only) |
| V (Value Density, supplemental) | 4.0 | Q11 | override (display-only) |
| RE (Response Effort, supplemental) | 4.0 | Q12 | override (display-only) |
| AU, U (supplemental) | 4.0 | **not interviewed** — per-vuln/provider; displayed from pasted vectors only | — |
| E / RL / RC (threat/temporal) | 4.0 / 3.1 | **not interviewed** — per-vuln; displayed and scored from pasted vectors only | — |
| MAC (4.0) | 4.0 | intentionally uncollected in v1 — Q2 maps to MAT for v4; add if a distinct question emerges | — |
