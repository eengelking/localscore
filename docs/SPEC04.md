# localscore — Specification v1.3 ("SPEC04")

> **Status (2026-07-09): fully implemented and historical.** This document has been superseded by `SPEC05.md`, which is now the active implementation contract. It is retained as the rationale for v1.3 behavior; do not drive new work from it. Note that SPEC05 amends three of this spec's rules: the §2.3 solid-yellow Edit control (SPEC05 §2.2), the §4.1 score-raising trigger set (SPEC05 §3.2.1 narrows it per this spec's own §8 fallback), and the §2.1 accent-badge treatment inside dense reference contexts (SPEC05 §5.3).

This document was the implementation contract for the v1.3 round of work. It superseded `SPEC03.md` (the v1.2 contract), which is fully implemented and historical, the same way SPEC03 superseded `SPEC02.md`. Treat every **MUST/MUST NOT** here as a hard requirement and every **SHOULD** as the default unless there is a documented reason to deviate.

**Everything in the v1/v1.1/v1.2 contracts that this document does not change remains binding** — in particular:

- Scoring math MUST match FIRST's reference calculators exactly (v4.0 / v3.1); the worked example (base 9.8 → "Disposable Dev Lab" 0.0) and the empty-profile identity remain required tests.
- Cap/override semantics, the question catalog's **metric effects**, and the answers-are-source-of-truth data model are unchanged.
- The mandated tech stack is unchanged: Node 22 + TypeScript strict, Hono, React + Vite, plain CSS custom properties (no UI framework, no component library with a large runtime), better-sqlite3 with sequential SQL migrations, Vitest, single container on port 8080.
- The app MUST remain fully functional offline. The only permitted outbound network calls are the NVD lookups. No CDN assets of any kind.
- The design system remains in force: semantic action colors (SPEC02 §2.2), the shared Modal (SPEC02 §2.4), the severity palette's reserved status, and contrast validation via the `dataviz` skill's `validate_palette.js` + WCAG math for any color tied to data or semantics. **This spec amends two specific rules** (the active-tab treatment and the solid-pill text color — §2.2, §2.4 below); everything else in those systems stands.
- No em-dashes in any user-facing string (SPEC03 §2.2); the product name renders bold in body copy (SPEC03 §2.1). All copy added under this spec follows both rules.

Scope of v1.3: a **color-system refresh** (accent-colored neutral buttons/badges and tabs replacing the gray/monotone treatments, a legible Edit control in light theme, white-family pill text in light theme), **Title Case button labels**, a new **environment risk warning** (surfacing on the Environments pages when a profile's answers can push scores *above* base — the same condition the Scoring/Saved screens already flag per-result), **NVD-description prefill** for saved CVEs, and a **collapsed-by-default CVE details** disclosure.

**Implementation status: fully implemented.** See `CLAUDE.md`'s SPEC04 sections for the finding-by-finding map to what changed.

---

## 1. Current-state findings (what's wrong today)

Codebase review, 2026-07-09, against `main` at 20b1316. File/line references are anchors, not exhaustive lists — implementers MUST search for siblings of each pattern.

1. **Neutral buttons and tags are gray and recede in both themes.** The plain `.button` (`web/src/styles.css:433`) is surface-colored with a gray border; the neutral `.badge` (`styles.css:679`) is a gray fill chip. They carry no color identity at all — the user reports they don't stand out in either theme. Affected controls include the "Answer Interview" text button on environment rows (`EnvironmentsPage.tsx:150`), the neutral tags on saved rows ("NVD", "Pasted vector", CVE IDs — `SavedVulnerabilitiesPage.tsx:201-202`), the "no profile yet" badges (`EnvironmentsPage.tsx:131-136`), and the affected-product / reference-tag chips in `CveDetailsView.tsx`.
2. **The Edit (pencil) control doesn't read as yellow in light theme.** `.icon-button-edit` (`styles.css:546`) uses the outline treatment with `--action-yellow-text`, whose light-theme value is `#8a6300` (`styles.css:77`) — a WCAG-safe dark amber that reads as muddy brown at icon size. Dark theme (`#e0b400`) reads fine.
3. **Solid severity pills use near-black text in light theme, which is hard to read.** `.pill` (`styles.css:615`) sets `color: var(--severity-ink)` (`#0b0b0b`, one value for both themes, `styles.css:48`) on the severity fills. In light theme the dark-on-bright pairing strains, especially on `--severity-medium`/`--severity-high`; the user wants white-family text there. Dark theme reads fine as-is.
4. **The Scoring tabs are monotone.** `.tab.is-active` (`styles.css:1534`) is the theme-inversion fill (near-black in light, white in dark) per SPEC02 §2.1 / SPEC03 §4.2. The user finds the black/white/gray tab bar harsh and wants color that isn't in the monotone family.
5. **Button labels are sentence case.** e.g. "Create & start interview" (`EnvironmentsPage.tsx:96`), "Answer interview" (`EnvironmentsPage.tsx:151`, `EnvironmentEditPage.tsx:131`), "Re-answer interview" (`EnvironmentEditPage.tsx:131`), "Score it" (`ScorePage.tsx:282`, `ScorePage.tsx:339`), "Look up" (`ScorePage.tsx:306`), the "Look up a CVE" tab (`ScorePage.tsx:229`), "Show more"/"Show less" (`CveDetailsView.tsx:32`), "← Back to environment" (`InterviewPage.tsx:67`), "complete the interview" (`EnvironmentResultRow.tsx:34`).
6. **Nothing on the Environments pages warns that a profile raises scores.** The Scoring results and Saved detail views flag a per-result modified score above base (red warning triangle in the collapsed row, `EnvironmentResultRow.tsx:46-53`, plus the expanded `.callout-warning`, `EnvironmentResultRow.tsx:65-70`). But an environment whose *answers themselves* can push scores above base (e.g. Q8 "stepping stone", Q9 safety "yes") shows nothing on the Environments list or edit view — the user only discovers it after scoring something.
7. **A saved CVE's description field starts empty even though NVD's description is sitting in the cache.** `POST /api/vulnerabilities` (`server/src/routes/vulnerabilities.ts:62`) never touches `description`; the NVD English description is already extracted for display (`extractCveDetails` in `server/src/lib/nvd.ts`, shown via `CveDetailsView`) but the user has to retype or copy it to get it into the editable/markdown-rendered description shown on the saved list.
8. **The CVE details block is too prominent.** `CveDetailsView.tsx` renders description, dates, affected products, and references fully expanded, both under a fresh lookup (`ScorePage.tsx:342`) and at the top of an expanded saved row (`SavedVulnerabilitiesPage.tsx:247`) — it dominates the panel and pushes the score content down. The user likes the content but wants it behind a chevron disclosure, collapsed by default.

---

## 2. Color system refresh

The unifying move: `--accent` (already theme-scoped and validated — `#3452c4` light / `#7c93f0` dark, `styles.css:23`) is promoted from "links, focus rings, and washes" to the app's **chrome color** — the color of neutral interactive/informational elements and the active tab. The severity palette stays reserved for severity and the four semantic action colors stay reserved for Save/Delete/Cancel/Edit; nothing here reuses either.

Every new fill/text and outline/text pairing introduced in this section MUST be contrast-validated in **both themes** with the established `dataviz` `validate_palette.js` + WCAG-math procedure, against the real `--surface` and `--surface-card` values, and the results recorded inline in `styles.css` comments (the file's existing convention). Do not eyeball.

### 2.1 Neutral buttons and badges get accent color

- **Neutral `.button`** (the plain text button, e.g. "Answer Interview"): restyle from gray-border-on-surface to an **accent outline** treatment — `--accent` border + `--accent` text on a transparent/surface background, with an `--accent-wash` hover fill (the same outline-button grammar `.icon-button-delete`/`.icon-button-edit` already use, but in the accent hue). Size/padding/radius/typography are unchanged — this is a recolor, not a new size system.
- **Neutral `.badge`** (`styles.css:679` — "NVD", "Pasted vector", CVE-ID chips, "no profile yet", affected products, reference tags): restyle from the gray fill onto the app's established **outline tag pattern** (the `.badge-severity` box model: transparent fill, colored text + border) in the accent hue. After this, the app's tags are uniformly outline-pattern: accent for neutral/informational, `--action-green-text` for "ready", `--severity-*-text` for severity.
- If `--accent` needs a text-safe darkening in either theme to clear 4.5:1 as small text/border-on-surface, introduce a `--accent-text` token (theme-scoped in all three token blocks) rather than shifting `--accent` itself — links and focus rings keep their current color.
- `.icon-button-quiet` (theme toggle, the Saved rows' eye toggle) and `.button-quiet`/`.link-button` **stay neutral** — they are deliberately quiet chrome, and coloring them would flatten the hierarchy this change is trying to create. See §7 notes.
- Semantic buttons (Save/Cancel/Delete/Edit) and `.button-primary` keep their current systems (except Edit, §2.3).

### 2.2 Active tab becomes accent-filled (amends SPEC02 §2.1 / SPEC03 §4.2 for tabs)

- `.tab.is-active` (`styles.css:1534`) changes from the theme-inversion fill (`--button-contrast-bg`/`--button-contrast-ink`) to a **solid `--accent` fill with `--accent-ink` text**, in both themes. Unselected tabs stay the quieter sunken siblings they are today; their hover state MAY pick up accent text. The disabled-offline behavior, tooltip text, tab order/default, and ARIA wiring are all unchanged — this is a recolor only.
- This is a **documented amendment** to SPEC02 §2.1's "active tab/nav states use the theme inversion" clause, driven by direct user feedback that the monotone tab bar is harsh. **`.button-primary` is NOT changed** — primary buttons keep the inversion treatment SPEC03 §4.1 shipped. If the accent-filled tab visually collides with an adjacent primary button in practice, escalate rather than improvise.
- Watch for the SPEC03-era hover gotcha: `.tab:hover` rules MUST stay scoped `:not(.is-active)` (`styles.css:1530`) so hovering the active tab can't wash its text out against the new fill. Verify with a computed-style check or hover-state screenshot, not a static screenshot (see CLAUDE.md's note on how this class of bug was caught last time).

### 2.3 Edit control reads as yellow in both themes

- `.icon-button-edit` moves from the yellow-outline treatment to a **solid `--action-yellow` fill with `--action-ink` icon** — the exact pairing `.button-cancel` already uses (both are the "yellow family" SPEC02 §2.2 mandates), so the pencil unmistakably reads yellow in light theme instead of muddy brown. Apply in both themes so Edit and Cancel share one yellow identity; the hover state brightens the fill like `.button-cancel:hover` does.
- `--action-yellow-text` remains defined (it still backs the edit-hover wash if kept, and nothing else) — remove it only if it ends up with zero users.
- The Delete red-outline treatment is unchanged; it reads correctly in both themes today.

### 2.4 Solid pill text goes white-family in light theme (amends the pill ink rule)

- `--severity-ink` becomes **theme-scoped**: the light theme switches to a white-family ink (`#ffffff` or a validated near-white), the dark theme keeps the current near-black `#0b0b0b` (dark theme is explicitly fine today and MUST NOT regress).
- Because white text fails contrast on the current bright light-theme fills, the light-theme `--severity-low/medium/high/critical` fills MUST be re-derived (deepened) until **each clears ≥ 4.5:1 with the new ink** at the pill's real rendered size, while preserving each band's hue identity (green / amber / orange / red). Dark-theme fills are untouched. Any changed token MUST be updated consistently across the three theme token blocks `styles.css` deliberately keeps in sync.
- Knock-on check (required): the light-theme `--severity-*-text` outline tokens (`.badge-severity-*`, delta figures, "Total:" line) were derived from the *old* fills' hue family — they don't have to change, but re-verify they still read as the same family next to the deepened fills, and adjust within validation if the mismatch is jarring.
- Second knock-on check (required): `AnimatedScore.tsx` uses the raw **fill** tokens as the animated score number's *foreground text color* (`colorFor()` returns `var(--severity-low)` etc., `AnimatedScore.tsx:61-68`), so deepening the light-theme fills changes the animated number's color too. This is likely an improvement (deeper hues read better as text on the light surface), but the implementer MUST verify the morph still reads well in both themes — and MAY switch `colorFor()` to the `--severity-*-text` tokens instead if that reads better, since text-on-surface is exactly what those tokens were validated for. Either way the number's color and the adjacent pill must keep landing together when the animation settles (the existing choreography invariant).
- "None" stays colorless (no pill chrome, muted text) — unchanged, and still not to be "fixed".

---

## 3. Title Case button labels

- Every **button-like text label** — `<button>` text, tab labels, and `.link-button` text — MUST use Title Case: capitalize each word except short connectors (a, an, the, and, or, to, of, on, in, for, &) unless first. Concretely, from finding #5:
  - "Create & start interview" → **"Create & Start Interview"** (`EnvironmentsPage.tsx:96`)
  - "Answer interview" → **"Answer Interview"** (`EnvironmentsPage.tsx:151`, `EnvironmentEditPage.tsx:131`)
  - "Re-answer interview" → **"Re-Answer Interview"** (`EnvironmentEditPage.tsx:131`)
  - "Score it" → **"Score It"** (`ScorePage.tsx:282`, `ScorePage.tsx:339`)
  - "Look up" → **"Look Up"** (`ScorePage.tsx:306`)
  - Tab "Look up a CVE" → **"Look Up a CVE"** ("Paste a Vector" and "Major CVEs" are already compliant)
  - "Show more" / "Show less" → **"Show More"** / **"Show Less"** (`CveDetailsView.tsx:32`)
  - "← Back to environment" → **"← Back to Environment"** (`InterviewPage.tsx:67`)
  - "complete the interview" → **"Complete the Interview"** (`EnvironmentResultRow.tsx:34`)
- In-flight label variants follow the same rule ("Scoring…", "Looking Up…", "Saving…", "Refreshing…" — note "Looking up…" gains a capital U). Single-word labels (Save, Cancel, Delete, Done, Next, Close, Refresh) are already compliant.
- Audit for stragglers beyond this list — the rule is the contract, the list is the known population at time of writing. The interview's answer **option cards** are catalog *content* (sentence-style answers like "Only from inside our network"), not chrome buttons — they are **exempt** and MUST NOT be title-cased.
- Out of scope: `aria-label`s, tooltips (including the exact SPEC02 §6.4 offline tooltip text, which MUST NOT change), placeholders, hints, and body copy — those stay sentence case.

---

## 4. Environment risk warning (new feature)

The product's differentiating angle: an environment's answers can make a vulnerability score **higher** than its base score — Q8 "stepping stone", Q9 safety "yes", and the Catastrophic requirement answers all can. The Scoring/Saved screens already flag this per-result (`delta > 0`); the Environments pages MUST now flag it **per-profile**, before anything is ever scored.

### 4.1 The rule: which profiles are "score-raising"

- An environment is score-raising (per CVSS version) when its derived metrics contain **any override that can push a modified score above the base score** for some vector. From the shipped catalog, that is exactly:

  | Metric(s) | Value | Version | Source answer |
  |---|---|---|---|
  | `CR` / `IR` / `AR` | `H` | 4.0 + 3.1 | Q5/Q6/Q7 "Catastrophic" |
  | `MSC`, `MSI`, `MSA` | `H` | 4.0 | Q8 "stepping stone" |
  | `MS` | `C` | 3.1 | Q8 "stepping stone" |
  | `MSI`, `MSA` | `S` | 4.0 | Q9 safety "yes" |

- Rationale: `cap` effects never raise severity by definition (SPEC01 §2.2); overrides to `N`/`L`/`M`-tier values only lower or hold; `CR/IR/AR=H` weight above the Not-Defined/Medium neutral in both versions' environmental math; the subsequent-system/scope overrides are SPEC01 §2.2's explicit "MAY increase above base" exception. Supplemental metrics (S, R, V, RE) never affect a score and MUST NOT trigger the flag (Q9's *scoring* effect is via MSI/MSA, not the supplemental `S`).
- **Server implementation**: a small documented predicate (suggested home: alongside the cap orderings in `server/src/scoring/orderings.ts`, or a sibling module) mapping metric+value → raising, applied to metrics **re-derived from `environment_answers` via `deriveMetrics()`** at request time (the same freshness approach `POST /api/score` uses), because `DerivedMetric` carries the `questionId`/`optionId` provenance the UI needs and the persisted `environment_metrics` cache does not. Encode the *rule* (override + value in the raising set), not a hardcoded list of question IDs, so catalog evolution keeps working.

### 4.2 API changes

- `GET /api/environments` (list) and `GET /api/environments/:id` (detail) each gain:
  - `raisesScores: { "4.0": boolean, "3.1": boolean }` — whether the profile is score-raising per version.
  - Detail route additionally gains `raisingAnswers: { questionId, optionId }[]` — the deduplicated provenance of every raising effect, so the edit view can name the responsible answers in plain English via the catalog it already fetches. (The list route does NOT carry `raisingAnswers`; the booleans are enough for an icon.)
- An environment with no answers reports `false`/`false` and an empty array. No migration; this is derived at read time.
- Mirror the new fields in `web/src/types.ts` and document them in `API.md` in the same change.

### 4.3 Environments list row

- When `raisesScores` is true for **either** version, the row (`EnvironmentsPage.tsx`) MUST show the red warning triangle — the existing `Icon name="warning"` colored `--action-red-text`, the same glyph/color grammar as `EnvironmentResultRow.tsx`'s per-result icon — placed in the row's badge/figures area so it reads as a status of this environment, with an accessible name (e.g. `aria-label="This environment's answers can raise scores above the base score"`).
- The icon itself is **not** a separate interactive control — the user reaches the explanation through the row's existing Edit affordance (per the user's own framing). It MUST NOT appear when the flag is false for both versions.

### 4.4 Environment edit view callout

- When the flag is set, `EnvironmentEditPage.tsx` MUST render a **highlighted warning section** — the shared `.callout-warning` treatment (red-accented card + warning icon, the same visual language as the more-vulnerable warning on results) — prominently placed (above or directly below the name/description card, not buried at the bottom).
- Content requirements: state plainly that, because of how this environment is configured, vulnerabilities can score **higher** here than their published base score; list each responsible answer as **question text + chosen answer text** (plain English from the catalog via `raisingAnswers` provenance — never raw metric codes outside fine print); and recommend the configuration be reviewed by a security professional. Wording is the implementer's, in the app's non-technical register, no em-dashes, "localscore" bold if mentioned.
- The callout is informational — it MUST NOT block editing or the interview, and it disappears (without a reload being required, on next fetch) once the answers no longer trigger the rule.

---

## 5. Saved vulnerabilities

### 5.1 NVD description prefills the description field

- When `POST /api/vulnerabilities` saves an **NVD-sourced** vulnerability (a `cveId` save) and the row's `description` would otherwise be **empty**, the server MUST populate `description` from the cached NVD payload's English description — the same value `extractCveDetails()` already derives (`server/src/lib/nvd.ts`). Use the row's effective `nvd_json` after the existing `COALESCE` carry-through, which the normal lookup-then-save path always has.
- Precedence rules (all MUST):
  - A **non-empty existing description is never overwritten** — a re-save of an already-saved CVE whose description the user has edited (or that was previously prefilled) leaves it alone.
  - The prefill happens **server-side at save time** and is stored in the `description` column like any other description — from then on it is ordinary user-editable content (`PUT /api/vulnerabilities/:id` edits it, the list renders it as markdown per SPEC02 §4, and clearing it is the user's right; a cleared description MAY be re-prefilled by a subsequent re-save, which is acceptable).
  - Pasted-vector saves (no `cveId`) and CVE saves with no cached `nvd_json` are unchanged: empty description.
- NVD descriptions are plain text; storing them raw is correct — the existing render-time markdown sanitization pipeline handles display. No truncation is required, but the implementer MAY cap at a generous length (e.g. 2000 chars with an ellipsis) if real payloads prove unwieldy — if capped, document the cap in `API.md`.
- No new columns, no migration, no client change to the save call.

### 5.2 CVE details collapse behind a disclosure

- `CveDetailsView.tsx` becomes a **collapsed-by-default disclosure** in both places it renders (fresh lookup on the Scoring page, expanded saved row): a compact summary header — a heading like "CVE Details" plus the app's standard rotating chevron (`Icon name="chevron"` inside the existing `.disclosure`/`.is-open` pattern, the same grammar as result rows) — that expands on click to reveal the full block (description, dates, affected products, references) exactly as rendered today.
- Since the component is shared, one implementation covers both surfaces; both MUST default collapsed on each fresh render (no persistence of the open state is required).
- Accessibility: the toggle is a real `<button>` (or `<details>/<summary>`) with `aria-expanded`; the existing internal "Show More/Show Less" description clamp stays as-is inside the expanded state.
- The summary header MAY surface one or two orienting fragments (e.g. the published date) so the collapsed row isn't a bare label, but MUST stay one line and visually secondary to the score/vector content above it.

---

## 6. Data model & API changes (summary)

**No migrations.** v1.3 adds no columns and no tables.

| Route | Change |
|---|---|
| `GET /api/environments` | Each item gains `raisesScores: { "4.0": boolean, "3.1": boolean }` (§4.2) |
| `GET /api/environments/:id` | Same `raisesScores`, plus `raisingAnswers: { questionId, optionId }[]` (§4.2) |
| `POST /api/vulnerabilities` | NVD-sourced saves prefill an empty `description` from the cached NVD description; never overwrites a non-empty one (§5.1) |
| All other routes | Unchanged |

Errors stay `{ error: string }` with correct status codes. `API.md` MUST be updated for the changed routes in the same change.

---

## 7. Testing requirements

Vitest; tests remain a release gate. New/updated coverage required:

1. **Score-raising predicate** (§4.1): an environment answered Q8 "stepping stone" flags both versions; Q9 safety "yes" flags 4.0 only; Q5/Q6/Q7 "Catastrophic" flags both; an all-caps/lowering profile (e.g. the worked-example "Disposable Dev Lab" answers) does NOT flag; an empty environment does NOT flag; supplemental-only answers (Q10–Q12) do NOT flag. Assert the API shape on both environment routes, including `raisingAnswers` provenance on the detail route.
2. **Consistency cross-check** (§4.1): for at least one flagged profile, `POST /api/score` with a suitable base vector actually produces `delta > 0` for that environment — tying the new flag to the real scoring behavior it predicts, not just to the lookup table.
3. **Description prefill** (§5.1, mocked fetch/fixtures): lookup-then-save of a CVE populates `description` with the NVD English description; re-save after a `PUT` description edit does not clobber it; pasted-vector saves stay empty; a CVE row with malformed/absent `nvd_json` description saves cleanly with an empty description (never a 500).
4. Existing test families (score parity, cap/override, environments CRUD, saved-vs-cache upsert, catalog copy rules, major-CVEs cache, markdown safety, CVE details extraction) MUST keep passing unmodified in intent.

UI behavior Vitest can't reach MUST be verified via the established Playwright + system-Chrome procedure, in **both themes**, before merge:

- Accent-outline neutral buttons and badges on every page that has them; contrast validation results recorded in `styles.css` comments.
- Accent-filled active tab, including the hover-on-active computed-style check (§2.2's gotcha) and the disabled-offline tab appearance.
- Solid-yellow Edit pencil next to Delete on the Environments list, Saved list, and environment edit view — screenshot both themes.
- Light-theme pills with white-family text across all four severities (Saved list, scored results, base-score card), plus the `AnimatedScore` color morph sanity check.
- Title Case sweep: screenshot/spot-check every button and tab label listed in §3 across all five pages, confirming option cards were NOT title-cased.
- Environment risk warning: create an environment answered as a stepping stone; confirm the list-row triangle, the edit-view callout naming the question/answer, and its absence after re-answering to "a dead end".
- Saved page: a CVE saved from a lookup shows its NVD description in the list (markdown-rendered); CVE Details renders collapsed by default in both the lookup flow and the expanded saved row, expands/collapses via the chevron, and the internal Show More clamp still works.

---

## 8. Notes & resolved ambiguities

- **Why accent, not a new hue, for neutral buttons/badges (§2.1)**: the app already reserves severity colors for severity and the four action colors for their actions; introducing a sixth family for "neutral chrome" would dilute both. `--accent` is already theme-scoped, validated, and semantically "the app's own color" — promoting it is the smallest coherent answer to "the gray doesn't stand out".
- **The tab amendment is deliberate and narrow (§2.2)**: SPEC02 §2.1's inversion rule still governs `.button-primary` and any future solid neutral control; only the active-tab state moves to accent, on direct user feedback. This spec is the documented record of that deviation.
- **Quiet controls stay quiet (§2.1)**: the theme toggle, the eye view/hide toggle, and `.link-button`s are intentionally low-hierarchy; coloring everything accent would recreate the original problem (nothing stands out) with extra steps.
- **Why the risk flag includes Q5/Q6/Q7 "Catastrophic" and not just Q8/Q9 (§4.1)**: the user tied this feature to the existing `delta > 0` warning ("this same warning on the environment page itself"). `CR/IR/AR = H` genuinely produces `delta > 0` results in both versions' math, so excluding them would make the environments page contradict the scoring page. The callout's wording should carry the nuance: these answers state the location has a lot to lose, which is a fact to be aware of and review, not necessarily a misconfiguration. If this proves too noisy in practice (every "Catastrophic" environment gets a triangle), narrowing to the subsequent-system/safety overrides is the documented fallback — escalate to the user before making that call.
- **The list-row warning icon is not a button (§4.3)**: the user's flow is icon → curiosity → Edit → explanatory callout. Making the icon itself navigate would duplicate the Edit affordance next to it.
- **Prefill is a save-time copy, not a live link (§5.1)**: once prefilled, the description is the user's editable text; a later NVD refresh does not update it. The authoritative NVD description remains visible (untouched) in the CVE Details block, so drift is harmless and the user's edits are never at risk.
- **Details stay expanded-capable everywhere, collapsed by default (§5.2)**: the user's complaint was prominence on the Saved page, but the component is shared and the lookup flow has the same crowding problem; one consistent collapsed-by-default behavior beats per-surface divergence. The score/vector content is the page's job; the details are reference material.
- **Pill ink stays near-black in dark theme (§2.4)**: the user explicitly said dark mode reads fine; the light theme is the only one being re-derived. This is why `--severity-ink` becomes theme-scoped instead of globally flipped.
