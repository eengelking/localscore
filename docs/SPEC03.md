# localscore — Specification v1.2 ("SPEC03")

> **Status (2026-07-09): fully implemented and historical.** This document has been superseded by `SPEC04.md`, which is now the active implementation contract. It is retained as the rationale for v1.2 behavior; do not drive new work from it.

This document was the implementation contract for the v1.2 round of work. It superseded `SPEC02.md` (the v1.1 contract), which is fully implemented and historical, the same way SPEC02 superseded `SPEC01.md`. Treat every **MUST/MUST NOT** here as a hard requirement and every **SHOULD** as the default unless there is a documented reason to deviate.

**Everything in the v1/v1.1 contracts that this document does not change remains binding** — in particular:

- Scoring math MUST match FIRST's reference calculators exactly (v4.0 / v3.1); the worked example (base 9.8 → "Disposable Dev Lab" 0.0) and the empty-profile identity remain required tests.
- Cap/override semantics, the question catalog's **metric effects**, and the answers-are-source-of-truth data model are unchanged. (This spec rewrites some catalog *wording* — §2.2, §6.3 — which SPEC01 §5.2 explicitly permits as long as effects don't change.)
- The mandated tech stack is unchanged: Node 22 + TypeScript strict, Hono, React + Vite, plain CSS custom properties (no UI framework, no component library with a large runtime), better-sqlite3 with sequential SQL migrations, Vitest, single container on port 8080.
- The app MUST remain fully functional offline. The only permitted outbound network calls are the NVD lookups. No CDN assets of any kind.
- SPEC02's design system remains in force: semantic action colors (§2.2), the shared Modal (§2.4), the severity palette's reserved status, contrast validation via the `dataviz` skill's `validate_palette.js` for any color tied to data or semantics.

Scope of v1.2: a copy/branding pass (bold product name, em-dash removal, Save-button consistency), light-theme severity-pill legibility, the primary-button/tab contrast treatment SPEC02 §2.1 mandated but v1.1 didn't fully deliver, real tab styling with per-tab purpose text, several small layout bugs (create-form spacing, half-width CVE result, zero-padding edit form), richer question-help modals, Major-CVEs typography + NVD links, **CVE detail enrichment** (description / references / affected products from NVD, carried through to saved entries), an inline more-vulnerable alert on result rows, and Saved-page affordance fixes (eye toggle, no loading flash, long-vector overflow).

**Implementation status: fully implemented.** See `CLAUDE.md`'s "SPEC03 UI polish, tabs, and CVE detail enrichment" section for the finding-by-finding map to what changed.

---

## 1. Current-state findings (what's wrong today)

Codebase review, 2026-07-09, against `main` at 42c5fd7. These findings are the factual basis for the requirements that follow. File/line references are anchors, not exhaustive lists — implementers MUST search for siblings of each pattern.

1. **Product name renders as plain text in body copy.** "localscore" appears unemphasized in `web/src/pages/EnvironmentsPage.tsx:66` and `web/src/pages/ScorePage.tsx:202`. (The header wordmark in `App.tsx` is already bold — that one is fine.)
2. **Em-dashes throughout user-facing copy.** Web pages/components (`EnvironmentsPage.tsx`, `ScorePage.tsx`, `SavedVulnerabilitiesPage.tsx`, `EnvironmentEditPage.tsx`, `InterviewPage.tsx`, `ScoreResult.tsx`, `ScoreChanges.tsx`, `EnvironmentResultRow.tsx`), the interview catalog's question/option/help text (`server/src/catalog/catalog.ts` — ~23 occurrences, including option labels like "Yes — meaningful extra layers" and the shared skip label), and server error messages that surface in the UI (`server/src/scoring/parse.ts`, `server/src/lib/nvd.ts` "Couldn't reach NVD — paste the CVSS vector directly instead.", `server/src/routes/cve.ts`'s CVE-ID validation message). `InterviewPage.tsx:123` additionally **hardcodes** a copy of the catalog's skip label ("Skip — not sure / doesn't apply") — two sources for one string.
3. **One Save button is not green.** The save panel's initial trigger in `web/src/components/ScoreResult.tsx:64` is a plain neutral `.button` labeled "Save". Every other Save in the app is `.button-save` (green).
4. **Severity pills are hard to read in the light theme.** Two variants exist: solid pills (`.pill-*`, near-black text on the severity fill) and outline pills (`.badge-severity-*` / `SeverityPill variant="outline"`, colored text + border on the surface). The `--severity-*-text` outline tokens were validated at 4.5:1, but at `--text-xs` (0.75rem) uppercase mono with a 1px border they read as thin/washed-out on the light surface; the solid `--severity-medium`/`--severity-high` fills are bright enough that the small dark text also strains in light mode. Dark theme reads fine.
5. **The green "ready" badge is a third, one-off tag style.** `.badge.is-complete` (`web/src/styles.css:651`) uses a translucent green *fill* via `color-mix`, unlike either established tag pattern (neutral filled `.badge`, outline `.badge-severity-*`).
6. **Create-form fields have no vertical spacing.** `EnvironmentsPage.tsx:84` uses `className="card new-environment-form"`, but **no `.new-environment-form` rule exists in `styles.css`** — the two `.field` blocks stack with zero gap, so the "Description (optional)" label butts up against the name row.
7. **`.button-primary` violates SPEC02 §2.1.** That spec mandated neutral/primary buttons and selected states be "a solid high-contrast inversion of the active theme"; the shipped `.button-primary` uses `--accent` blue instead (`styles.css:419`), which is what makes "Create & start interview" (and "Score it", "Look up", "Next") read poorly in both themes. This is an unclosed v1.1 compliance gap, not a new requirement.
8. **Question-help modals feel inconsistent and thin.** `.modal` has a constant max-width (26rem) but its height swings with content, so hopping between questions makes the dialog visibly resize; the `<h2>` header inherits `--font-display` (IBM Plex Mono), which reads jarring for a full question sentence; and the body is only `whyWeAsk` (one or two sentences) plus, on Q1/Q4, `finePrint` — too succinct to be genuinely helpful.
9. **The Scoring tabs don't look like tabs.** `ScorePage.tsx:214` has correct `role="tablist"`/`tab`/`tabpanel` semantics but reuses `.mode-toggle`'s segmented-control styling (a pill slider), so the three modes read as buttons. Nothing inside a selected panel explains what that mode is for — the CVE tab shows just a label and a text field.
10. **Major CVEs rows are all-mono.** `.major-cve-row` sets `font-family: var(--font-display)` on the whole row (`styles.css:1489`), so the published date and everything else renders in IBM Plex Mono, unlike the rest of the site where mono is reserved for headlines/scores/vector strings.
11. **Major CVEs rows have no link to NVD.** The only interaction is the in-app lookup.
12. **The CVE lookup result renders at half width.** `.score-form` is a column flexbox with `align-items: flex-start`; only `.field` children get an explicit `width: 100%` (`styles.css:1083`), so `.cve-lookup-result` shrinks to its content width (~400px observed) instead of filling the card.
13. **CVE lookups surface no context.** The lookup result shows only vectors/scores. The cached NVD payload (`vulnerabilities.nvd_json`) already contains the CVE's English description, references (tagged e.g. `Patch`, `Vendor Advisory`), affected-product CPE configurations, and published/last-modified dates — none of it is extracted or displayed, in either the lookup flow or the saved-vulnerability detail view.
14. **The more-vulnerable warning only appears after expanding.** `EnvironmentResultRow.tsx` shows the `.callout-warning` inside the expanded detail panel; the collapsed summary row communicates "more exposed" only via the red `+n.n` delta.
15. **Saved rows' View/Hide control is mismatched and flashes "Loading…".** It's a text `.button` (taller than the 2.25rem `.icon-button` Edit/Delete squares next to it), and its label swaps to "Loading…" during the fetch (`SavedVulnerabilitiesPage.tsx:215`), causing a jarring width/label jump.
16. **Long vectors can wreck the saved-row header.** A pasted-vector save with no label uses the full vector string as its label (server default), rendered as an `<h3 class="environment-name">` with no overflow handling inside the flex `.vulnerability-row-header`; a long CVSS v4.0 vector (150+ chars, no spaces) will overflow or force ugly wrapping. `.environment-row-main` also lacks `min-width: 0`, so the flex item can't shrink below its content.
17. **The saved-row edit form has zero padding.** In edit mode the row renders `.environment-edit-form` directly inside `.card.vulnerability-row`, and `.vulnerability-row` sets `padding: 0` (`styles.css:1580` — needed for the header/detail layout in view mode). The Label/Description fields and Save/Cancel buttons touch the card edges.

---

## 2. Global copy & branding

### 2.1 Bold product name

- Everywhere the name "localscore" appears in rendered UI copy, it MUST be bold — wrap in `<strong>` (or equivalent). Today that is the two body-copy occurrences in finding #1; any copy added or rewritten under this spec MUST follow the same rule.
- The header wordmark already renders bold and is compliant as-is.

### 2.2 Remove em-dashes from all user-facing text

- **No em-dash (`—`) may appear in any user-facing string**: page copy, button/tab labels, tooltips, catalog question/option/help text, and server-produced error or note messages that the UI displays. Rewrite each sentence to read naturally without the dash — a period and a new sentence, a comma, a colon, or parentheses, chosen per sentence for clarity, not a mechanical find-and-replace with a hyphen. The goal is text that sounds like a person wrote it.
- In scope (from finding #2): all `web/src/pages/*.tsx` and `web/src/components/*.tsx` copy; `server/src/catalog/catalog.ts` (labels, descriptions, `whyWeAsk`, `finePrint` — wording changes only, **metric effects MUST NOT change**, per SPEC01 §5.2's polish allowance); user-facing error strings in `server/src/scoring/parse.ts`, `server/src/lib/nvd.ts`, and `server/src/routes/cve.ts`. Update any tests that assert on these exact strings in the same change.
- The duplicated skip label: update the catalog's `SKIP_OPTION` label and the hardcoded copy in `InterviewPage.tsx:123` together (e.g. "Skip: not sure / doesn't apply"). SHOULD deduplicate by exporting the label from one place (the catalog already ships to the client via `GET /api/catalog`), but keeping two synchronized literals is acceptable.
- Out of scope: code comments, commit messages, and the `docs/` specs themselves. Hyphens in compound words ("air-gapped") and minus signs in deltas (`-1.3`) are obviously unaffected.
- Enforcement: add a Vitest case (natural home: `server/test/catalog.test.ts`) asserting no `—` appears in any catalog `question`/`label`/`description`/`whyWeAsk`/`finePrint`/`helpDetail` string, and a small web-side test or check asserting the same for a grep over `web/src` JSX string literals is acceptable if done pragmatically (a test that imports and scans the catalog is required; the web sweep MAY be a documented one-time verification).

### 2.3 Save buttons are always green

- Every control labeled "Save" MUST use `.button-save` (solid green, per SPEC02 §2.2). Concretely: the save-panel trigger in `ScoreResult.tsx:64` becomes `.button .button-save`. Audit for any other stragglers.
- The rest of the SPEC02 §2.2 semantic table (Delete/Cancel/Edit) is unchanged and stays in force.

---

## 3. Severity pill legibility (light theme)

- The severity pills (both variants) MUST be re-audited for light-theme legibility and adjusted. Dark theme is acceptable today and MUST NOT regress.
- **Outline variant** (`.badge-severity-*`, used on the Saved list and Major CVEs): increase visual weight so the colored text reads clearly at its small size — bump `font-weight` to 700 and border to 1.5px (or equivalently effective changes), and re-validate every `--severity-*-text` token at ≥ 4.5:1 against **both** `--surface` and `--surface-card` in both themes, darkening light-theme hues where needed. Use the established `dataviz` skill `validate_palette.js` + WCAG-math procedure; do not eyeball.
- **Solid variant** (`.pill-*`): re-validate each light-theme fill with `--severity-ink` text at the pill's real rendered size (0.75rem, uppercase). Where a pairing is technically ≥ 4.5:1 but reads glaring/washed (the bright `--severity-medium` yellow and `--severity-high` orange are the reported offenders), adjust the light-theme fill (e.g. slightly deepen the hue) or the text treatment until it reads cleanly. Any changed token MUST be updated in all three token blocks (`:root`, the media query, `:root[data-theme=…]`) that `styles.css` deliberately keeps in sync.
- The severity palette remains reserved (never reused for non-severity meaning), and "None" stays colorless.
- Verify with Playwright screenshots of the Saved list and a scored result in both themes.

---

## 4. Buttons and tabs

### 4.1 Primary buttons: close the SPEC02 §2.1 gap

- Implement the inversion rule as originally mandated: **`.button-primary` becomes a solid high-contrast inversion of the active theme** — light theme: near-black fill (`--ink`-family) with light text; dark theme: light fill with near-black text. Introduce explicit tokens (e.g. `--button-contrast-bg` / `--button-contrast-ink`) defined in all three theme blocks rather than hardcoding.
- This changes every primary action: "Create & start interview", "Score it", "Look up", the interview's "Next"/"Done". They all keep `.button-primary`; only the class's colors change. `--accent` remains for links, focus rings, progress ticks, selected option cards, and the nav's active state (which are washes/outlines, not solid fills — acceptable, see §11).
- Semantic buttons (Save/Cancel/Delete/Edit) are exempt per SPEC02 §12: semantic color wins.
- Contrast for the new pairing MUST be validated in both themes (it will pass trivially, but record it).

### 4.2 Real tab styling (Scoring page)

- Restyle the Scoring page's three modes as **recognizable tabs**, replacing the `.mode-toggle` segmented-pill treatment there: a horizontal tab bar visually attached to the panel below it (shared bottom border / connected panel edge), where the **selected tab is unmistakably distinct** — solid inversion fill per §4.1's contrast rule (SPEC02 §2.1 named active-tab states explicitly) or a visibly connected "raised" tab; the unselected tabs read as quieter siblings, not equal buttons.
- Keep the existing `role="tablist"`/`tab`/`tabpanel` wiring, the tab order and default (Look up a CVE → Paste a Vector → Major CVEs, CVE default), the disabled-offline behavior and exact tooltip text from SPEC02 §6.4 — all unchanged. This is a visual change only.
- New CSS classes (e.g. `.tabs` / `.tab`) SHOULD replace `.mode-toggle` usage on this page; if `.mode-toggle` has no remaining users, remove it.

### 4.3 Per-tab purpose text

- Each tab panel MUST open with one short plain-English line stating what the user can do there, styled consistently (e.g. a `.tab-purpose` muted line above the form):
  - **Look up a CVE**: enter a CVE ID (like CVE-2026-55200) to fetch its official score and details from NVD and see how it applies to your environments.
  - **Paste a Vector**: paste a CVSS vector from a scanner or advisory to score it against your environments.
  - **Major CVEs**: the ten most critical CVEs published in the last 30 days, from NVD; click one to look it up.
- Exact wording is the implementer's (follow §2.2's no-em-dash rule and a non-technical register); the three intents above are the contract.

---

## 5. Environments page fixes

### 5.1 Create-form spacing

- Give the create form its missing layout rule: `.new-environment-form` MUST stack its fields with the app's standard form gap (match `.environment-edit-form`'s `gap: var(--space-5)` or visibly equivalent spacing) so "Description (optional)" no longer touches the name row.

### 5.2 Standardize the "ready" badge

- Restyle `.badge.is-complete` onto one of the two established tag patterns — mandated choice: the **outline** pattern (`.badge-severity-*`'s shape: transparent fill, colored text + border), keeping a green identity. The green MUST be a text-safe token validated per theme (add e.g. `--action-green-text` alongside the existing `--action-*-text` tokens; do **not** reuse `--severity-low-text` — the severity palette stays reserved for severity).
- The neutral "no profile yet" badge is already the standard `.badge` and is unchanged. After this, exactly two tag treatments exist app-wide: neutral filled, colored outline.

---

## 6. Interview question help modal

### 6.1 Consistent size

- The help modal MUST NOT visibly change size from question to question. Give the question-help modal a fixed width (the shared `.modal` max-width is fine) **and a `min-height`** sized so the largest question's content and the smallest render in the same-sized dialog (content vertically top-aligned; pick the min-height from the largest real content, roughly 18–20rem, and verify against all 12 questions). Content exceeding it scrolls within the dialog per the existing `max-height` rule.
- The delete-confirmation modal MAY stay content-sized (it's a different, terse dialog), but both MUST share width, radius, padding, and header treatment.

### 6.2 Modal header typography

- Modal headers (`.modal-header h2`) MUST render in the body font (`--font-body`, weight 700), not the display mono — scoped to modals only; page/section headings elsewhere keep IBM Plex Mono. This applies to all modals (help + confirm) so the system stays uniform.

### 6.3 Richer help content

- Add an optional `helpDetail?: string[]` field to `Question` (`server/src/catalog/types.ts`) — an array of plain-English paragraphs. `GET /api/catalog` carries it automatically; mirror it in `web/src/types.ts`.
- **Write `helpDetail` for all 12 questions**: 2–4 sentences each, in the interview's colleague-explaining register, covering (a) what the question is really getting at, (b) one or two concrete examples of environments answering each way, and (c) what answering it does to a score in plain terms (e.g. "if you pick this, exploits that need internet access count for less here"). No CVSS jargon outside `finePrint`. **Metric effects MUST NOT change**; this is additive content. Wording follows §2.2 (no em-dashes).
- `QuestionHelpModal.tsx` renders order: question title → `whyWeAsk` → `helpDetail` paragraphs → `finePrint` block (unchanged treatment, still mandatory-reachable for Q1/Q4 per SPEC01 §5.2).
- Update the SPEC01-derived catalog-integrity test only if it enumerates fields strictly; the catalog's §2.2 no-em-dash test (this spec) MUST cover `helpDetail` too.

---

## 7. Scoring page

### 7.1 Major CVEs typography

- Remove `font-family: var(--font-display)` from `.major-cve-row` as a whole. Mono is reserved for the CVE ID (`.major-cve-id`) and the score figure (`.score-figure` already carries it); the published date and any other prose in the row use the body font, consistent with the rest of the site.

### 7.2 NVD link on each Major CVE row

- Each row MUST offer a direct link to that CVE's NVD page: `https://nvd.nist.gov/vuln/detail/<CVE-ID>`, rendered as a plain external `<a href>` with `target="_blank" rel="noopener noreferrer"` (no network call by the app; same policy as the §6.1/SPEC02 explainer links). Suggested shape: a small external-link affordance (text "NVD" link or a new `external-link` icon in `Icon.tsx`) inside the row, with `stopPropagation` so clicking the link does not also trigger the row's in-app lookup. Keyboard/AT: the link and the row action MUST be independently reachable — which likely means the row's lookup becomes an explicit element rather than the whole row being one `<button>` wrapping a nested link (nested interactive elements are invalid).

### 7.3 CVE lookup result fills the card

- `.cve-lookup-result` MUST span the full width of its card: give it `width: 100%` (or `align-self: stretch`) rather than inheriting `.score-form`'s `align-items: flex-start` shrink-wrap. Check the same card for other shrink-wrapped full-width-intended children while there.

### 7.4 CVE detail enrichment (new feature)

The lookup flow and the saved-vulnerability detail view MUST show real context about a CVE, extracted from the NVD payload the app already caches.

- **Server**: add an extraction helper in `server/src/lib/nvd.ts` (sibling to `extractVectorOptions`) that pulls from a cached `nvd_json`:
  - `description` — the English entry from `vulnerabilities[0].cve.descriptions` (fall back to the first entry if no `lang: "en"`).
  - `published` / `lastModified` — from `vulnerabilities[0].cve`.
  - `references` — from `cve.references`: `{ url, source?, tags? }[]`, preserving NVD's tags (`Patch`, `Vendor Advisory`, `Exploit`, …). Cap at a sane count (e.g. first 20).
  - `affectedProducts` — a **best-effort, human-readable** summary derived from `cve.configurations` CPE match criteria: unique `vendor product` pairs parsed from `cpe:2.3:` URIs (e.g. `google chrome`), deduplicated, capped (e.g. 15) with a `+N more` count. Version-range fidelity is explicitly NOT required in v1.2; this is orientation, not an SBOM match.
  - All fields optional/empty-tolerant: NVD payload shapes vary and older cached rows must not 500.
- **API**: `GET /api/cve/:cveId` and `GET /api/vulnerabilities/:id` each gain a `details` object with the fields above, derived at read time from the row's `nvd_json`. **No migration and no new stored columns** — the §7.1/§7.3 (SPEC02) upsert already carries `nvd_json` onto saved entries, so saved CVEs get details "for free", exactly as the user story requires ("if the user saves the CVE, the additional information should be saved as well"). Pasted-vector saves have no `nvd_json` and return `details: null`; the UI shows nothing extra for them.
- **Client — lookup flow**: after a successful lookup, render (in the now-full-width `.cve-lookup-result`, alongside the existing vector picker): the description (body copy, clamped with an expand affordance if long), published/last-modified dates, affected products as `.badge` chips, and references as a compact link list with their tags as small badges, `Patch`/`Vendor Advisory`-tagged links listed first. All links external-`<a>` with `noopener noreferrer`. Layout MUST stay clean and secondary to the score/vector content (the design skill applies).
- **Client — saved detail**: the expanded saved-vulnerability view renders the same details block (same component) above/alongside the existing `NvdVectorPicker` + `ScoreResult`, when `details` is present.
- Offline behavior is unchanged: details come from cache exactly like vectors do; a stale cache serves stale details.

### 7.5 Inline more-vulnerable alert on result rows

- In `EnvironmentResultRow.tsx`'s collapsed summary, whenever `result.delta > 0`, a **red warning triangle** (the existing `Icon name="warning"`) MUST render **immediately before the animated score figure** in `.result-row-figures`, colored `--action-red-text` (the same red as the expanded callout), and **sized to match the score figure's height** (the score is `.score-figure-lg`, `--text-2xl` = 2.5rem; size the icon to that line so it reads as a peer of the number, not a footnote).
- It carries an accessible name (e.g. `aria-label`/`title` "Scores higher than the base score here") and MUST NOT appear when `delta <= 0`. The existing expanded `.more-vulnerable-warning` callout stays; this is an addition, not a replacement.
- Note: the icon appears/disappears with the *final* delta. Since the row's delta figure is already static (only the score number animates), keying the icon off `result.delta` directly is acceptable; it does not need to participate in the animation choreography.

---

## 8. Saved page

### 8.1 View/Hide becomes an eye icon button

- Replace the text View/Hide `.button` with a **2.25rem `.icon-button`** so it matches the Edit/Delete squares beside it: an `eye` icon when collapsed (action: view) and an `eye-off` (crossed-out eye) icon when expanded (action: hide). Add both icons to `Icon.tsx` as bundled inline SVGs per SPEC02 §2.3.
- Color: the **neutral** icon-button treatment (default `.icon-button` border/ink, like `ThemeToggle`'s family) — view/hide is not one of SPEC02 §2.2's four semantic actions, so it MUST NOT take a semantic color.
- `aria-label` switches with state ("View details" / "Hide details"). The header row's whole-row click toggle stays; the button keeps its `stopPropagation`.

### 8.2 No "Loading…" flash

- Remove the "Loading…" label swap. While the detail fetch is in flight the button keeps its size and icon (optionally `disabled` or with reduced opacity); the detail panel simply appears when ready. On typical local latency this is imperceptible; no spinner is required. Errors keep the existing error-surface behavior.

### 8.3 Long vector/label overflow

- The saved-row header MUST tolerate arbitrarily long labels (a pasted-vector save defaults its label to the full vector string). Mandated fixes: `min-width: 0` on the header's flex text column (`.environment-row-main` within `.vulnerability-row-header`), and `overflow-wrap: anywhere` (or `word-break: break-all` for the vector-like case) on `.environment-name` in this context so an unbroken 150+-character vector wraps within its column instead of overflowing the card or shoving the action buttons off-layout. Wrapped vector text SHOULD render at a reduced size (`.vector-string`-like treatment) when the label *is* a vector, but plain wrapping is the minimum bar.
- Verify with Playwright using a real maximal CVSS v4.0 vector (all metrics including environmental/supplemental) saved unlabeled, at desktop and 480px widths.

### 8.4 Edit-form padding

- Fix the zero-padding edit state (finding #17): wrap the row's edit form in a padded container (e.g. a `.vulnerability-row-edit` block applying the card's standard `var(--space-5)` padding) rather than removing `.vulnerability-row { padding: 0 }` (which the view-mode header/detail layout depends on). Label, Description, Cancel, and Save must sit inset from the card edges like every other card's content.

---

## 9. Data model & API changes (summary)

**No migrations.** v1.2 adds no columns and no tables.

| Route | Change |
|---|---|
| `GET /api/cve/:cveId` | Response gains `details: { description, published, lastModified, references[], affectedProducts[] } \| null`, derived at read time from cached `nvd_json` (§7.4) |
| `GET /api/vulnerabilities/:id` | Same `details` object, same derivation; `null` for pasted-vector saves with no `nvd_json` |
| `GET /api/catalog` | Questions gain optional `helpDetail: string[]` (§6.3) |
| All other routes | Unchanged |

Errors stay `{ error: string }` with correct status codes (their *wording* changes per §2.2 where they contained em-dashes).

---

## 10. Testing requirements

Vitest; tests remain a release gate. New/updated coverage required:

1. **CVE details extraction** (§7.4, mocked fetch / fixture JSON): description picked by `lang: "en"` with fallback; references preserve tags and cap; `affectedProducts` dedupes vendor/product pairs from CPE URIs and caps with a remainder count; malformed/absent sections yield empty fields, never a throw; `GET /api/cve/:cveId` and `GET /api/vulnerabilities/:id` both surface `details`; a pasted-vector save's detail returns `details: null`.
2. **Catalog copy rules** (§2.2, §6.3): no `—` in any catalog string field (including `helpDetail`); every question has non-empty `helpDetail`; metric effects byte-identical to the pre-SPEC03 catalog (extend the existing catalog-integrity test — effects are the contract, wording is not).
3. **Error-message updates**: existing tests asserting exact server error strings (parse errors, NVD-unreachable) updated alongside the rewording, keeping their *intent* (specific and friendly) per SPEC01 §6.
4. Existing test families (score parity, cap/override, environments CRUD, saved-vs-cache upsert, major-CVEs cache, markdown safety) MUST keep passing unmodified in intent.

UI behavior Vitest can't reach MUST be verified via the established Playwright + system-Chrome procedure, in **both themes**, before merge:

- Bold "localscore" in body copy; no em-dashes visible on any screen (spot-check all five pages including the interview and both modals).
- Green save trigger on the score result; severity pills legible in light theme (screenshot review of Saved list + scored results).
- Primary buttons and the active tab render as theme inversions; tabs read as tabs; each tab shows its purpose line.
- Create form spacing; "ready" badge in the outline style.
- Help modal: constant size across all 12 questions, body-font header, `helpDetail` rendered.
- Major CVEs: body-font dates, working NVD links that don't trigger the row lookup.
- CVE lookup: result fills the card; details block renders (use a cached fixture or a real lookup); saved CVE detail shows the same block; warning triangle sized to the score on a delta>0 row.
- Saved page: eye/eye-off toggle aligned with Edit/Delete; no loading flash; long-vector row wraps cleanly at desktop and 480px; edit form padded.

---

## 11. Notes & resolved ambiguities

- **"Create & start interview" color** (user report) is resolved by finally implementing SPEC02 §2.1's inversion rule (§4.1) rather than by inventing a new color: the complaint and the standing spec point at the same fix. `--accent` is *not* being removed; it remains the link/focus/selection-wash color. The nav's `is-active` state and option-card selection use accent *washes* rather than solid fills — this spec leaves them as-is; §2.1's inversion is enforced for solid controls (primary buttons, active tab). If an implementer finds this reading wrong in practice, escalate rather than improvise.
- **Em-dash removal deliberately includes the interview catalog.** SPEC01 §5.2 allows phrasing polish without a spec update so long as effects are untouched; this spec is nevertheless the documented record that the wording changed and why. SPEC01's §5.2 tables remain the authority on *effects* only.
- **`affectedProducts` is orientation, not truth.** CPE configuration trees encode version ranges and boolean logic this feature intentionally flattens. Do not present it as an authoritative applicability check; a label like "Affected products (from NVD)" is enough.
- **View/Hide gets no semantic color** because SPEC02 §2.2's semantic set (Save/Delete/Cancel/Edit) is closed; adding a fifth semantic hue for a non-destructive toggle would dilute it. Neutral is the answer the design system already gives.
- **Why no migration for CVE details**: SPEC02 §7.1/§7.3 already guarantee `nvd_json` lands on saved CVE rows via the upsert; deriving details at read time keeps the raw payload the single source of truth and makes the feature retroactive for every previously saved CVE.
- **Modal min-height applies to the help modal, not ConfirmModal** — a delete prompt stretched to 18rem would look broken. Shared width/typography is the consistency users actually perceive across modal types.
- The **saved-row header's whole-row click** (SPEC02-era behavior) survives §8.1; only the button inside it changes form.
