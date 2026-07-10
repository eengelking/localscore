# localscore — Specification v1.4 ("SPEC05")

This document is the **active implementation contract** for the next round of work. It supersedes `SPEC04.md` (the v1.3 contract), which is fully implemented and now historical, the same way SPEC04 superseded `SPEC03.md`. Treat every **MUST/MUST NOT** here as a hard requirement and every **SHOULD** as the default unless there is a documented reason to deviate.

**Everything in the v1/v1.1/v1.2/v1.3 contracts that this document does not change remains binding** — in particular:

- Scoring math MUST match FIRST's reference calculators exactly (v4.0 / v3.1); the worked example (base 9.8 → "Disposable Dev Lab" 0.0) and the empty-profile identity remain required tests.
- Cap/override semantics, the question catalog's **metric effects**, and the answers-are-source-of-truth data model are unchanged.
- The mandated tech stack is unchanged: Node 22 + TypeScript strict, Hono, React + Vite, plain CSS custom properties (no UI framework, no component library with a large runtime), better-sqlite3 with sequential SQL migrations, Vitest, single container on port 8080.
- The app MUST remain fully functional offline. The only permitted outbound network calls are the NVD lookups. No CDN assets of any kind.
- The design system remains in force: semantic action colors (SPEC02 §2.2), the shared Modal (SPEC02 §2.4), the severity palette's reserved status, the SPEC04 accent-chrome system, and contrast validation via the `dataviz` skill's `validate_palette.js` + WCAG math for any color tied to data or semantics. **This spec amends three specific rules** (the Edit control's mandated yellow — §2.2; the score-raising flag's trigger set — §4.2; the accent badge treatment inside dense reference contexts — §6.3); everything else stands.
- No em-dashes in any user-facing string (SPEC03 §2.2); the product name renders bold in body copy (SPEC03 §2.1); button-like labels use Title Case (SPEC04 §3). All copy added under this spec follows all three rules.
- UI/visual work MUST go through the `frontend-design` skill before writing JSX/CSS; data-tied colors additionally through the `dataviz` skill (per CLAUDE.md's standing instruction). Several sections below name these skills explicitly where the user asked for them by name — those are hard requirements, not reminders.

Scope of v1.4: **global chrome fixes** (a proper light/dark switch control, a redesigned Edit affordance, layout-stable scrollbars), an **environments location field** (new column + UI), a **redesign of the environment risk warning** into a two-tier system (a narrowed structural score-raising flag plus new answer-combination "red flags"), **Scoring-page focus and typography fixes** (auto-focused inputs per tab, larger Major-CVE IDs), and a **Saved-page cleanup** (header actions that stop wrapping under descriptions, a CVE-details disclosure that matches the app's established disclosure grammar, de-blued detail content, and an NVD link in the details block).

**Implementation status: not yet implemented.** This is the to-do list.

---

## 1. Current-state findings (what's wrong today)

Codebase review, 2026-07-09, against `main` at 10cfcca. File/line references are anchors, not exhaustive lists — implementers MUST search for siblings of each pattern.

1. **The theme toggle is a small quiet icon button.** `ThemeToggle.tsx` renders a 2.25rem `.icon-button-quiet` whose sun/moon icon is the `Icon` default 16px (`Icon.tsx:45`). The user finds the icon too small, and wants the control to read as an **on/off switch** (mobile-style): light = off, dark = on, with a highlighted color indicating state, with the sun/moon icons living inside the switch itself.
2. **The Edit pencil's solid yellow fill throws off the design.** SPEC04 §2.3 moved `.icon-button-edit` to a solid `--action-yellow` fill (`styles.css:565-569`) to fix the light-theme "muddy brown" outline problem — but the resulting bright yellow square dominates every row it sits in (Environments list, Saved list, edit view) and clashes with the accent/outline chrome around it.
3. **Scrollbar appearance shifts page layout.** Neither `html` nor `body` (`styles.css:252-264`) reserves scrollbar space, so navigating from a short page (no scrollbar) to a long one (scrollbar) shifts all centered content horizontally — a visible jump.
4. **Environments have no location field.** The `environments` table (migration `0001_init.sql`) carries only `name` and `description`; a user recording where an environment physically or logically lives ("Building 4", "us-east-1", "Store #212 back office") has to bury it in the markdown description. The user has confirmed a **dedicated field** is wanted.
5. **The environment risk warning over-triggers.** `server/src/scoring/raising.ts:9-24` flags `CR/IR/AR = H` — i.e. answering "Catastrophic" on Q5/Q6/Q7 alone sets the red triangle. An environment that legitimately has everything to lose (the user's example: a government IL6 system) is flagged **permanently**, making the warning meaningless exactly where stakes are highest. SPEC04 §8 pre-registered narrowing as the documented fallback ("escalate to the user before making that call") — the user has now made that call, and additionally wants the warning to become smarter: flag **mismatches between stakes and operational readiness** (e.g. catastrophic CIA answers combined with uncertain recovery), which the current metric-level rule cannot express because Q10–Q12's supplemental answers never participate.
6. **The CVE-ID input doesn't take focus.** `ScorePage.tsx:96` focuses only the paste tab's textarea on mode change; activating "Look up a CVE" (including the initial page load, where it is the default tab) leaves `#cve-input` unfocused.
7. **Major-CVE IDs render too small.** `.major-cve-id` (`styles.css:1661`) sets mono + weight but no size, so the row's primary identifier inherits body-size text while sitting next to a larger score figure — the user reports the page feels jarring against the rest of the site's type scale.
8. **Saved-row action buttons wrap under the badges when a description exists.** `.vulnerability-row-header` is `flex-wrap: wrap` (`styles.css:1863-1871`); once a row has a description, `.environment-row-main` grows enough that `.environment-row-actions` (eye/pencil/trash) wraps below the badge row instead of staying pinned to the header's far right as it does on description-less rows.
9. **The CVE-details disclosure doesn't look like the app's other disclosures.** `.cve-details-summary` (`styles.css:1733-1748`) is an unpadded `--text-sm` text button with a 16px chevron (`CveDetailsView.tsx:43`), while the app's established expandable-row grammar (`.result-row-summary`, `styles.css:1244-1256`) is a full-width padded row with a 20px chevron. The user expected the CVE-details header to follow that grammar and reports it's not obviously clickable.
10. **The expanded CVE details are visually all one blue.** SPEC04 §2.1 made every neutral `.badge` an accent outline; inside `CveDetailsView` that means the affected-product chips (`CveDetailsView.tsx:72,77`) and reference tags (`CveDetailsView.tsx:93`) render in the same `--accent` as the reference links beside them — links, tags, and chips are indistinguishable and the block reads as a wall of blue.
11. **The CVE details block has no link to NVD.** Major-CVE rows got an NVD link in SPEC03 §7.2, but the details view for a looked-up or saved CVE offers no way to open `https://nvd.nist.gov/vuln/detail/<CVE-ID>`.

---

## 2. Global chrome

### 2.1 Theme toggle becomes a switch (new control)

- Replace the header's icon-button theme toggle with a **switch control** (the mobile on/off pattern): a pill-shaped track with a sliding thumb. **Light = off (thumb left), dark = on (thumb right).** The "on" (dark) state uses a highlighted fill — `--accent` is the natural choice per the SPEC04 chrome system; the "off" state uses a quiet neutral track. The **sun and moon icons render inside the switch** (one convention, kept consistent: either both icons in the track with the thumb covering the active side, or the active icon riding in the thumb — the `frontend-design` skill decides which reads better), at a size **noticeably larger than today's 16px** (target ≥ 20px within a track tall enough to hold it comfortably).
- The `frontend-design` skill MUST be invoked to design this control (explicit user request). Any fill/icon color pairing introduced MUST be contrast-validated in both themes per the established `dataviz` `validate_palette.js` procedure, results recorded in `styles.css` comments.
- Accessibility: the control is a real `<button role="switch" aria-checked>` (or an equivalently correct pattern) with an `aria-label` naming the action; keyboard operable; visible focus ring. `prefers-reduced-motion` disables the thumb-slide animation.
- Behavior is otherwise unchanged: `web/src/lib/theme.ts`'s localStorage persistence, the `data-theme` attribute mechanics, and the pre-first-render application in `main.tsx` all stay as they are. Position stays at the far right of the header.

### 2.2 Edit control redesign (amends SPEC02 §2.2 / SPEC04 §2.3)

- The solid-yellow `.icon-button-edit` (SPEC04 §2.3) is replaced. This spec deliberately does **not** hardcode the replacement treatment — the user asked for the `frontend-design` skill to solve it, so the skill MUST be invoked and the outcome documented (in `styles.css` comments and CLAUDE.md) as the record of what was chosen and why.
- Hard constraints the chosen design MUST satisfy:
  - Reads clearly as an edit/pencil affordance **in both themes** at the 2.25rem icon-button size (the original failure mode: SPEC02's `--action-yellow-text` outline read as muddy brown in light theme; SPEC04's solid fill reads as a glaring yellow square — both are documented dead ends, do not return to either verbatim).
  - **Does not dominate the row**: it sits beside the neutral eye toggle and the red-outline Delete on Saved rows, and beside badges on Environment rows; it must read as a peer of Delete, not the loudest element on the card.
  - Any color used is contrast-validated in both themes against `--surface` and `--surface-card` (dataviz procedure, results recorded).
  - Keeps the 2.25rem `.icon-button` box, the pencil glyph, and `aria-label="Edit"`.
- Likely shapes (guidance, not mandate): the outline grammar Delete already uses, in whatever hue survives validation and legibility at icon size — including possibly the accent family, since SPEC02 §2.2's "yellow family" pairing with Cancel is hereby **released as a requirement** for the Edit icon (Cancel's solid yellow button is unchanged). If a yellow that genuinely works is found, keeping the family is welcome but no longer required.
- Cleanup rule: after the change, remove any `--action-*` token left with zero users (same policy SPEC04 §2.3 applied to `--action-yellow-text`).
- Apply everywhere `.icon-button-edit` appears: Environments list, environment edit view (if present), Saved list. Screenshot both themes in verification.

### 2.3 Layout-stable scrollbar

- The vertical scrollbar (or its reserved gutter) MUST be present on every page regardless of content height, so navigating between short and long pages never shifts content horizontally.
- Mandated fix: `html { overflow-y: scroll; }`. An implementer MAY instead use `scrollbar-gutter: stable` if verification shows it fully eliminates the jump in the target browsers — but the always-visible-scrollbar behavior is what the user asked for, so `overflow-y: scroll` is the default answer.
- Verify with Playwright: capture the horizontal position of a fixed header element on the shortest page (e.g. an empty Saved list) and a long page (Environments with several rows, or a scored result), and assert they match. Note: macOS overlay scrollbars can mask the bug locally — the computed-position check is the gate, not eyeballing.

---

## 3. Environments

### 3.1 Location field (new)

- **Migration `0004_environments_location.sql`**: `ALTER TABLE environments ADD COLUMN location TEXT NOT NULL DEFAULT '';`. Existing rows get the empty string.
- **Semantics**: a short, optional, single-line, plain-text place label — where this environment lives physically or logically ("Building 4, rack 12", "us-east-1", "Store #212 back office"). It is *not* markdown (unlike `description`) and is not involved in scoring, interviews, or derivation in any way.
- **API**: `POST /api/environments` and `PUT /api/environments/:id` accept an optional `location` string (same COALESCE-on-missing-field pattern the PUT route already uses for `description`); `GET /api/environments` and `GET /api/environments/:id` return it. Mirror in `web/src/types.ts` and document in `API.md`. Server SHOULD trim and MAY cap length generously (e.g. 200 chars) — if capped, document it.
- **UI**:
  - The create form (`EnvironmentsPage.tsx:84`) gains an optional "Location" `.input` alongside the existing name/description fields.
  - The environment edit view (`EnvironmentEditPage.tsx`) gains the same input in the name/description card, saved by the existing Save button.
  - List rows and the edit view display a non-empty location as a small muted line (or a labeled fragment) near the environment name — visually secondary to the name, distinct from the markdown description below it. Empty location renders nothing (no placeholder text).
- The `frontend-design` skill governs the exact list-row presentation, as usual for UI work.

### 3.2 Environment risk warning becomes two-tier (redesigns SPEC04 §4)

User decision (recorded 2026-07-09): the SPEC04 §4.1 rule over-triggers — "Catastrophic" on Q5/Q6/Q7 alone must stop flagging (the IL6 problem: an environment that simply *has* a lot to lose would be flagged forever, making the warning meaningless). The warning splits into two tiers with distinct meanings:

#### 3.2.1 Tier 1 — structural score-raising flag (narrowed)

- `server/src/scoring/raising.ts`'s `RAISING_VALUES` drops `CR`/`IR`/`AR` from **both** versions. The raising set becomes exactly:

  | Metric(s) | Value | Version | Source answer |
  |---|---|---|---|
  | `MSC`, `MSI`, `MSA` | `H` | 4.0 | Q8 "stepping stone" |
  | `MS` | `C` | 3.1 | Q8 "stepping stone" |
  | `MSI`, `MSA` | `S` | 4.0 | Q9 safety "yes" |

- Rationale: these are the structural facts (blast radius, safety) that SPEC01 §2.2 names as the deliberate above-base exception, and they represent something *about the environment's position*, not merely its stakes. This is the fallback SPEC04 §8 pre-registered, now exercised with explicit user approval. Note the honest trade-off: a `CR/IR/AR = H`-only profile **can** still produce `delta > 0` on the scoring page without carrying the environment-level flag — the callout copy and this paragraph are the documented record of why that's acceptable (stakes are not a misconfiguration).
- API shape (`raisesScores`, `raisingAnswers`) is unchanged; only the trigger set narrows. Existing tests asserting Q5/Q6/Q7 "Catastrophic" flags MUST be inverted to assert it does **not** flag; the Q8/Q9 cases and the `POST /api/score` consistency cross-check (SPEC04 §7.2, which used Q8) stay.

#### 3.2.2 Tier 2 — configuration red flags (new)

The genuinely new capability: correlate **stakes answers with operational-readiness answers** — the interview data the app already holds — to call out environments whose configuration doesn't match what they claim to protect. This is where Q10–Q12's supplemental answers finally earn their keep beyond display chips.

- **The rule set** (v1.4 contract; encoded as data, one entry per flag, so future rounds can add entries without restructuring). Define "high stakes" as: any of Q5/Q6/Q7 answered "Catastrophic", **or** Q9 safety answered "Yes".

  | Flag id | Condition | Meaning (plain-English register for the callout) |
  |---|---|---|
  | `uncertain_recovery` | high stakes **and** Q10 recovery = "Uncertain" | This location says a compromise would be catastrophic, but recovery would be improvised. |
  | `concentrated_availability` | Q7 availability = "Immediate serious impact" (Catastrophic) **and** Q11 value density = "Concentrated" | Uptime is critical here, yet the resources are concentrated on single systems. |
  | `hard_to_patch` | high stakes **and** Q12 patch effort = "Hard" | The stakes are high but patching is slow and disruptive, so vulnerabilities stay open longer. |

- **Skip answers never contribute** in either direction: an unanswered/skipped question neither satisfies nor blocks a condition (all conditions require the named answers to actually be present).
- **Server implementation**: a new sibling module (suggested: `server/src/scoring/redflags.ts`) operating on the environment's **answers** (`environment_answers` + catalog), not on derived metrics — the conditions involve supplemental questions whose answers exist only as answers. Unlike `raising.ts` (deliberately metric-level), this module is **catalog-coupled by design**: conditions reference `questionId`+`optionId` pairs. Add a catalog-integrity test asserting every id referenced by the rule set exists in the shipped catalog, so catalog evolution breaks loudly, not silently.
- **API**: 
  - `GET /api/environments` (list): each item gains `redFlags: string[]` — the triggered flag ids (empty array when none).
  - `GET /api/environments/:id` (detail): gains `redFlags: { id: string, answers: { questionId, optionId }[] }[]` — each triggered flag with the deduplicated provenance of the answers that satisfied it, same provenance pattern as `raisingAnswers`.
  - Computed at request time from answers (same freshness approach as `raisesScores`). No migration. Mirror in `web/src/types.ts`, document in `API.md`.

#### 3.2.3 UI

- **List row** (`EnvironmentsPage.tsx`): the red warning triangle (`.raises-scores-icon` treatment, unchanged glyph/color grammar) now shows when **either** `raisesScores` is true for either version **or** `redFlags` is non-empty. The `aria-label` generalizes (e.g. "This environment's configuration needs review"). Still not an interactive control — Edit remains the path to the explanation (SPEC04 §4.3's framing stands).
- **Edit view callout** (`EnvironmentEditPage.tsx`): the existing `.callout-warning` expands to cover both tiers, clearly separated so they don't blur into one message:
  - The **score-raising** portion (when `raisesScores` is set) keeps its current content: scores can go higher here than the published base score, per-answer list from `raisingAnswers`, recommend professional review.
  - The **red flags** portion (when `redFlags` is non-empty) renders one short block per flag: the flag's plain-English meaning (per the table above; exact wording is the implementer's, in the app's non-technical register), followed by the responsible question + chosen answer text resolved from the catalog via the provenance — never raw metric codes or flag ids outside fine print.
  - Either portion renders alone when only one tier triggers; the callout disappears entirely (on next fetch, no reload) when neither does. It remains purely informational — never blocks editing or the interview.
- Copy rules apply (no em-dashes, bold **localscore** if mentioned, non-technical register).

---

## 4. Scoring page

### 4.1 Tab inputs take focus

- Activating the **"Look up a CVE"** tab MUST focus `#cve-input`; activating **"Paste a Vector"** keeps its existing focus behavior on the vector textarea (`ScorePage.tsx:96`). One consistent effect handles both (keyed on `mode`), replacing the paste-only special case.
- This includes the **initial render**: the CVE tab is the default, so the CVE input is focused when the Scoring page first mounts (when that tab is enabled; the offline-disabled case falls through to the paste tab's existing redirect-and-focus behavior, unchanged).
- The Major CVEs tab has no input and focuses nothing.

### 4.2 Major-CVE ID typography

- `.major-cve-id` MUST render at a size that reads as the row's primary identifier and sits comfortably in the site's type scale next to the score figure — minimum `var(--text-base)`, with `var(--text-lg)` preferred if it verifies well (frontend-design judgment within that range). Mono + weight stay as they are.
- Check the 480px stacked layout (`styles.css:1696-1712`) still reads correctly after the bump.

---

## 5. Saved page

### 5.1 Header actions stop wrapping under the badges

- On `.vulnerability-row-header`, the action cluster (eye / edit / delete) MUST stay pinned to the far right of the header row — top-right of the card — regardless of whether the row has a description, exactly as it renders today on description-less rows.
- Root cause to fix: `flex-wrap: wrap` on `.vulnerability-row-header` (`styles.css:1868`) lets `.environment-row-actions` wrap below `.environment-row-main` once a description makes the main column tall/wide. Mandated shape: the header becomes a non-wrapping two-column layout (`flex-wrap: nowrap` with `align-items: flex-start`, or an equivalent grid) where the text column keeps `min-width: 0` + `overflow-wrap: anywhere` (the SPEC03 §8.3 long-vector protections MUST keep working) and the actions column keeps `flex-shrink: 0`.
- Verify with Playwright at desktop and 480px: a row with a multi-line markdown description **and** a row whose label is a maximal unbroken CVSS v4.0 vector, in both themes. At 480px a deliberate stacked layout is acceptable if designed (media query), but accidental mid-header wrapping is not.

### 5.2 CVE-details disclosure adopts the app's disclosure grammar

- The `.cve-details-summary` header MUST be restyled to match the established expandable-row pattern (`.result-row-summary`'s grammar): a full-width padded clickable row (hover state included) whose text sits at the same scale as other row summaries, with the rotating chevron at **`<Icon name="chevron" size={20} />`** — the same size result rows use — instead of today's 16px (`CveDetailsView.tsx:43`).
- It MUST read as obviously openable at a glance: visible affordance (padding + hover + full-size chevron at minimum; a bounded/bordered summary row if the design skill finds it needs more). The "CVE Details · Published <date>" content, collapsed-by-default behavior, `aria-expanded`, and the internal Show More/Show Less clamp are all unchanged from SPEC04 §5.2.
- The component is shared, so one change covers both the Scoring-page lookup flow and the expanded Saved row.

### 5.3 De-blue the expanded details (amends SPEC04 §2.1 inside dense reference contexts)

- Inside `.cve-details-body`, **links must be the only accent-colored element**. The affected-product chips and reference tags currently render as accent-outline `.badge`s (SPEC04 §2.1) directly beside accent links, making everything one undifferentiated blue.
- Mandated direction: metadata chips in this context (affected products, reference tags) move to a **quiet neutral outline treatment** (muted ink border/text — the tag box model unchanged, only the hue), so the visual hierarchy becomes: link = accent = interactive; chip = neutral = metadata. This is a **documented, narrow amendment** to SPEC04 §2.1's "all neutral badges go accent" rule, scoped to contexts where badges sit adjacent to links; the accent badge treatment elsewhere (Saved-row source/CVE-ID tags, "no profile yet") is unchanged.
- The `frontend-design` skill MUST be invoked for this cleanup (explicit user request), with the `dataviz` skill's validation procedure for any new text/border color (a muted-ink token likely already exists — reuse `--ink-muted`/`--ink-secondary`-family tokens if they validate at the chip's rendered size rather than minting new ones).
- Screenshot the expanded details block in both themes as part of verification.

### 5.4 NVD link in the CVE details

- The details block MUST offer a direct external link to the CVE's NVD page: `https://nvd.nist.gov/vuln/detail/<CVE-ID>`, rendered with the same grammar as the Major-CVE rows' NVD link (SPEC03 §7.2: plain `<a href>`, `target="_blank" rel="noopener noreferrer"`, `Icon name="external-link"`). Suggested placement: at the top of the expanded `.cve-details-body`, or on the summary row's right side beside the chevron (with `stopPropagation` so it doesn't toggle the disclosure) — the design skill picks; the link existing is the contract.
- `CveDetailsView` doesn't currently know the CVE ID — add a `cveId?: string | null` prop, passed from both call sites (`ScorePage.tsx` has the looked-up id; `SavedVulnerabilitiesPage.tsx` has `vuln.cveId`). No link renders when absent (pasted-vector saves have `details: null` anyway, so in practice this only defends against odd states).

---

## 6. Data model & API changes (summary)

One migration:

```sql
-- 0004_environments_location.sql
ALTER TABLE environments ADD COLUMN location TEXT NOT NULL DEFAULT '';  -- §3.1
```

| Route | Change |
|---|---|
| `POST /api/environments` | Accepts optional `location` (§3.1) |
| `PUT /api/environments/:id` | Accepts optional `location`, COALESCE-on-missing (§3.1) |
| `GET /api/environments` | Items gain `location: string` and `redFlags: string[]` (§3.1, §3.2.2); `raisesScores` semantics narrow per §3.2.1 |
| `GET /api/environments/:id` | Gains `location: string` and `redFlags: { id, answers[] }[]`; `raisesScores`/`raisingAnswers` semantics narrow per §3.2.1 |
| All other routes | Unchanged |

Errors stay `{ error: string }` with correct status codes. `API.md` MUST be updated for the changed routes in the same change.

---

## 7. Testing requirements

Vitest; tests remain a release gate. New/updated coverage required:

1. **Location field** (§3.1): create with/without location; PUT updates it and PUT-without-`location` leaves it untouched (COALESCE); both GET routes return it; migration 0004 applies cleanly on an existing database (pre-existing rows come out `''`).
2. **Narrowed raising flag** (§3.2.1): Q5/Q6/Q7 "Catastrophic" alone **no longer** flags either version (inverting the SPEC04-era assertions); Q8 "stepping stone" still flags both versions with provenance; Q9 safety "yes" still flags 4.0 only; the `POST /api/score` consistency cross-check for a Q8 profile stays passing.
3. **Red flags** (§3.2.2): each of the three flags triggers on its exact condition; a single condition half (e.g. Catastrophic alone, or "Uncertain" recovery alone) does NOT trigger; Q9 "yes" satisfies "high stakes" for `uncertain_recovery`/`hard_to_patch`; skipped questions never satisfy a condition; empty environment yields `[]`; API shape on both routes including detail-route provenance; catalog-integrity check that every questionId/optionId in the rule set exists in the catalog.
4. Existing test families (score parity, cap/override, environments CRUD, saved-vs-cache upsert, catalog copy rules, major-CVEs cache, markdown safety, CVE details extraction, description prefill) MUST keep passing unmodified in intent.

UI behavior Vitest can't reach MUST be verified via the established Playwright + system-Chrome procedure, in **both themes**, before merge:

- Theme switch: renders as an on/off switch with in-switch sun/moon icons at the larger size; toggling flips the theme and persists across reload; `role="switch"`/`aria-checked` present; reduced-motion honored.
- Edit affordance: screenshots of Environments list, Saved list, and the edit view in both themes; the chosen treatment documented in `styles.css` comments.
- Scrollbar: computed horizontal position of a header element identical between a short page and a long page.
- Location: create/edit round trip through the UI; list row shows it muted next to the name; empty stays blank.
- Risk warning: a Q8 stepping-stone environment shows the triangle and the score-raising callout; a Q5-Catastrophic-only environment shows **nothing**; a Catastrophic + Q10-"Uncertain" environment shows the triangle and the `uncertain_recovery` red-flag block naming both answers; re-answering to clear the condition removes it without reload.
- Scoring: CVE input focused on page load and on switching back to the CVE tab; vector input focused on switching to Paste a Vector; Major-CVE IDs at the new size, 480px layout intact.
- Saved: rows with descriptions keep eye/edit/delete pinned top-right at desktop; long-vector labels still wrap; CVE-details summary matches the result-row disclosure grammar (padding, hover, 20px chevron) and reads clickable; expanded details show accent links against neutral chips; NVD link opens the right URL and doesn't toggle the disclosure.

---

## 8. Notes & resolved ambiguities

- **The location field is a dedicated column, not a description convention** — user decision (2026-07-09), choosing the small migration over burying location in prose. It is plain text on purpose: a place label doesn't need markdown, and keeping it single-line makes it safe to render inline next to the name.
- **The risk-warning redesign is the SPEC04 §8 fallback, exercised** — SPEC04 explicitly documented "narrowing to the subsequent-system/safety overrides" as the fallback if Catastrophic-triggered flags proved too noisy, requiring user sign-off first. The user confirmed the noise problem (the IL6 example) and chose the two-tier design: narrow the structural flag AND add the combination red flags, rather than either alone.
- **Why red flags are answer-level while raising stays metric-level**: the raising rule is about CVSS math (which override values can push a score above base), so it's encoded against metrics and survives catalog evolution automatically. The red flags are about *human* configuration judgments ("you said catastrophic but also said you'd improvise recovery"), which only exist at the answer level — hence the deliberate catalog coupling, defended by an integrity test instead of indirection.
- **Red flags deliberately don't fire on stakes alone.** The user's guiding constraint: "we don't want to flag the system JUST BECAUSE it has sensitive data." Every rule pairs a stakes condition with a readiness gap. Adding future rules should preserve this shape.
- **The Edit treatment is constraint-specified, not color-specified** — two prescriptive attempts (SPEC02's yellow outline, SPEC04's solid yellow) each failed a different way, so this round states the constraints and mandates the `frontend-design` skill choose within them, per the user's explicit framing. SPEC02 §2.2's yellow-family requirement is released for the Edit icon only; Cancel stays solid yellow.
- **`overflow-y: scroll` over `scrollbar-gutter`** because the user asked for the scrollbar to "always exist"; the gutter property is the permitted alternative only if it demonstrably kills the layout jump, since reserving the gutter without the bar can look like a mysterious right margin on overlay-scrollbar platforms.
- **The de-blue amendment is scoped, not a rollback** — SPEC04 §2.1's accent-badge system stays the app-wide default; it only yields inside contexts where badges sit adjacent to accent links (today: the CVE details block). If future surfaces hit the same collision, apply the same neutral-chip answer and note it, rather than re-litigating the system.
- **Focus-on-tab-activation is deliberately symmetric** (§4.1) — the user called out that the CVE and paste tabs should match; the existing paste-only effect becomes the general rule rather than gaining a second special case.
