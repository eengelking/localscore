# localscore — Specification v1.1 ("SPEC1")

This document is the **active implementation contract** for the next round of work. It supersedes `SPEC.md` (the v1 contract), which is fully implemented and now historical. Treat every **MUST/MUST NOT** here as a hard requirement and every **SHOULD** as the default unless there is a documented reason to deviate.

**Everything in the v1 contract that this document does not change remains binding** — in particular:

- Scoring math MUST match FIRST's reference calculators exactly (v4.0 / v3.1); the worked example (base 9.8 → "Disposable Dev Lab" 0.0) and the empty-profile identity remain required tests.
- Cap/override semantics, the question catalog and its metric effects, and the answers-are-source-of-truth data model are unchanged by this spec.
- The mandated tech stack is unchanged: Node 22 + TypeScript strict, Hono, React + Vite, plain CSS custom properties (no UI framework, no component library with a large runtime), better-sqlite3 with sequential SQL migrations, Vitest, single container on port 8080.
- The app MUST remain fully functional offline. The only permitted outbound network calls are the NVD lookups (§6.5, §6.6 below). **No CDN assets of any kind** — fonts, icons, and any markdown/renderer code MUST be bundled.

Scope of v1.1: a UI/UX consistency overhaul (buttons, icons, tabs, theming), markdown description fields, environment and saved-vulnerability **edit views**, a fix for the saved-vulnerability duplication/overwrite behavior, a "Major CVEs" feed, and closing three carried-over v1 gaps (§8).

---

## 1. Current-state findings (what's wrong today)

Codebase review, 2026-07-08. These findings are the factual basis for the requirements that follow.

1. **Buttons are inconsistent.** `web/src/styles.css` defines `.button`, `.button-primary`, `.button-quiet`, and `.link-button`, applied ad hoc: Delete is a quiet text button in some places, Save/Confirm is sometimes primary and sometimes neutral, and sizes vary between contexts. No icons anywhere; no semantic color mapping (save/delete/cancel/edit all look interchangeable).
2. **Delete has no confirmation modal.** Both `EnvironmentsPage.tsx` and `SavedVulnerabilitiesPage.tsx` use `window.confirm()`.
3. **No theme toggle.** Dark mode exists only via `@media (prefers-color-scheme: dark)` in `styles.css`; the user cannot switch themes in-app.
4. **Header labels** are "Score a vulnerability" and "Saved vulnerabilities" (`App.tsx`).
5. **No environment edit view.** The list offers only "Edit interview"/"Answer interview" (opens the wizard) and Delete. `PUT /api/environments/:id` (rename + description) exists on the server but is **unreachable from the UI**, and the create form collects only a name even though `POST /api/environments` accepts a description. Descriptions render as plain text.
6. **Interview page**: exit is a "Save & exit" quiet button in the page header; question help (`whyWeAsk` + `finePrint`) renders inline / as a `<details>` element, not as an on-demand modal.
7. **Score page**: the two input modes are a segmented `.mode-toggle` (not tabs), "Paste a vector" (lower-case v) is first and default, CVE-lookup errors render as bare red `.error-text`, there is no offline awareness, and there is no Major-CVEs surface.
8. **Saved-vulnerability duplication (bug).** The `vulnerabilities` table doubles as the NVD cache and the saved list. `GET /api/cve/:cveId` inserts a cache row on every first lookup; `POST /api/vulnerabilities` unconditionally INSERTs another row on save; `GET /api/vulnerabilities` returns **all** rows. Net effect: looking up a CVE and saving it produces **two** list entries, and re-saving the same CVE or vector produces further duplicates.
9. **Saved vulnerabilities are not editable.** No `PUT /api/vulnerabilities/:id`, no `description` column, label fixed at save time.
10. **Saved-from-CVE loses NVD data.** `POST /api/vulnerabilities` accepts an `nvdJson` field but the frontend never sends it, so a saved CVE shows no multi-vector picker until the CVE is re-looked-up (the "known gap, by design" in v1 — now in scope to fix).
11. **Result-row affordances are weak**: the expand indicator is a raw `▾` text character (`EnvironmentResultRow.tsx` `.disclosure`), the `.delta` (`delta-up`/`delta-down`/`delta-flat`) figures are small, the "Total:" line in `ScoreChanges.tsx` is unstyled, and nothing explains that a modified score **above** base means the environment is *more* exposed.

---

## 2. Design system: buttons, icons, and semantic colors

### 2.1 Uniform buttons

- All buttons across the app MUST share one size/typography/radius/padding system (a small set of sizes is fine — e.g. default and compact — but the same action in different screens MUST use the same size). Kill one-off button styles.
- **Contrast rule**: neutral/primary buttons and selected states MUST be a solid high-contrast inversion of the active theme — dark theme ⇒ solid light button with dark text; light theme ⇒ solid dark button with light text. This applies to the default button, the primary action, selected option cards, and active tab/nav states.
- Semantic action buttons (below) keep their semantic colors in both themes; every fill/text and outline/text pairing MUST be contrast-validated in both themes (use the `dataviz` skill's `validate_palette.js` + WCAG math, per the established process for the severity palette).

### 2.2 Semantic actions

| Action | Presentation |
|---|---|
| **Save** | Solid **green** button, text label "Save" (never an icon). |
| **Delete** | **Red outline** button with a **trash-can icon** (no text label; `aria-label="Delete"`). Every delete MUST be guarded by a confirmation modal (§2.4). |
| **Cancel** | **Yellow** (a yellow derived from / validated against the app palette), text label "Cancel" (never an icon). |
| **Edit** | **Pencil icon** button (no text label; `aria-label="Edit"`), same yellow family as Cancel. |

All existing controls MUST be migrated onto this system — e.g. the ScoreResult save flow's "Confirm" becomes a green "Save", its "Cancel" becomes yellow, both list pages' Delete buttons become red-outline trash icons.

### 2.3 Icons

- Icons (trash, pencil, sun, moon, chevron, circled `?`, warning) MUST be inline SVG bundled with the app — no icon font, no CDN, no new heavyweight dependency. A tiny local `Icon` component set is the expected shape.
- Icon-only buttons MUST carry `aria-label`s.

### 2.4 Confirmation modal (shared component)

- One reusable modal component: centered dialog, backdrop that **blurs** the page behind it (`backdrop-filter: blur(...)` + dim), closable via an explicit Cancel/close control and the Escape key, focus-trapped, `role="dialog"` + `aria-modal`.
- Used for: every delete confirmation (environments, saved vulnerabilities), the interview question-help modal (§4.4), and any future modal. `window.confirm()` MUST be removed.
- Delete confirmations state what will be deleted by name and that it can't be undone; the destructive confirm button follows the Delete style (red), the dismiss button follows Cancel (yellow).

### 2.5 Badges/tags

- The green "ready" badges on the environments list (`.badge.is-complete`) MUST be visually consistent with the app's other tags (`.badge`, severity pills): same shape, size, and weight system, differing only in color. Audit all badge/tag/pill usages onto one scale.

---

## 3. Theming: light/dark toggle

- Add a **sun/moon icon toggle** at the far right of the header. Sun shown when switching to light is available, moon for dark (icon reflects the action or the state — pick one convention and keep it; no text label, `aria-label` required).
- Theme MUST be applied via a `data-theme="light" | "dark"` attribute on the root element, with all theme tokens keyed off it. Initial value: the user's stored preference (localStorage), falling back to `prefers-color-scheme`. The existing media-query-only dark mode MUST be refactored so the toggle always wins.
- Every surface — including the severity palette's dark-mode overrides, the new semantic button colors, modals, and tabs — MUST render correctly under both themes.

---

## 4. Markdown description fields

- **Every description field in the app** (environments today, saved vulnerabilities per §6.3, and any added later) MUST render as Markdown wherever it is displayed — links, emphasis, lists, inline code.
- Use a small, maintained, bundled Markdown library (e.g. `marked` or `micromark`-family). **Raw HTML pass-through MUST be disabled/sanitized** — descriptions are user input; rendering must not introduce XSS. Links render with `rel="noopener noreferrer"` and open in a new tab.
- Editing UIs present descriptions as plain textareas (no WYSIWYG); rendering happens on display.

---

## 5. Header

- Nav label "Score a vulnerability" → **"Scoring"**; "Saved vulnerabilities" → **"Saved"** (`App.tsx`). Page `<h1>`s may stay descriptive, but nav labels are exactly these.
- Theme toggle per §3 sits at the far right of the header.

---

## 6. Scoring page

### 6.1 Page description

- Replace the current one-liner with a clearer, more concise description aimed at a non-technical user: what a score/vector is and where to find one (NVD, MITRE CVE, scanner output such as Trivy or Grype).
- Add a **"More" expander** (collapsible, and re-collapsible) with the longer explanation: what a CVE is, what a CVSS vector is, how they're used here — including **links to the NVD and MITRE CVE websites** (plain external `<a href>` links; the app itself still makes no network call for this).

### 6.2 Tabs

- The input modes become real **tabs** (proper tab styling + `role="tablist"`/`tab`/`tabpanel` semantics), in this order:
  1. **Look up a CVE** (first, and the default tab)
  2. **Paste a Vector** (exact casing — capital V)
  3. **Major CVEs** (§6.5)
- Active-tab styling follows the §2.1 contrast rule.

### 6.3 CVE lookup errors

- A failed lookup (CVE not found, no CVSS data, NVD unreachable) MUST render as a styled **warning banner** consistent with the design system — red-accented card/callout with a warning icon — never bare red error text. Message stays specific and friendly; the NVD-unreachable case keeps v1's behavior of directing the user to (and focusing) the paste tab.

### 6.4 Offline behavior

- When no internet connection is available, the "Look up a CVE" tab MUST be **disabled**, with a hover tooltip reading exactly: **"Internet connection required to look up a CVE."**
- Detection: `navigator.onLine` plus reacting to `online`/`offline` events is the baseline; a failed NVD fetch may also flip the state. Coming back online re-enables the tab without a reload.
- The Major CVEs tab follows the same rule when it has no cached data to show (§6.5).

### 6.5 Major CVEs tab (new feature)

- A new tab listing the **top 10 most critical CVEs published in the last 30 days**, sourced from the NVD API (the app's existing, only-permitted external service).
- **Server**: new endpoint `GET /api/major-cves` (a distinct path — it MUST NOT be routed through `/api/cve/:cveId`). It queries NVD's CVE API filtered to critical severity (`cvssV3Severity=CRITICAL`, and `cvssV4Severity=CRITICAL` where applicable) with `pubStartDate`/`pubEndDate` spanning the last 30 days, merges results, and returns the top 10 by base score (ties broken by most recent publication). Respect the existing module-wide NVD throttle and `NVD_API_KEY`.
- **Updated daily**: the server caches the computed list (new table or cache row with a `fetched_at`) and serves the cache without a network call while it is < 24 h old. A stale cache triggers a refresh on access; if the refresh fails, serve the stale cache with its `fetched_at` disclosed (same offline philosophy as v1 §7). No background scheduler is required — lazy daily refresh on request is the mandated design. Timeouts stay short; the UI never hangs on NVD.
- **Client**: each listed CVE shows at minimum its ID, base score + severity pill, and published date. Clicking one MUST land the user in the "Look up a CVE" flow exactly as if they had searched that CVE ID (i.e. it triggers the normal lookup, cache-first).
- Offline with a cached list: show the cached list with a "last updated" notice. Offline with no cache: the tab is disabled with the §6.4 tooltip treatment.

### 6.6 Saving an already-saved CVE or vector

Current behavior (a bug, per §1.8): every save INSERTs a new row. **Mandated behavior: overwrite.**

- Saving a vulnerability that already exists in the saved list — same `cve_id` for NVD-sourced saves, same normalized `vector` for pasted-vector saves — MUST **update the existing entry** (label, vector, score, NVD data, timestamps), never create a second one.
- The UI MUST make this clear at save time: when the save will overwrite an existing entry, the save panel says so before/as the user confirms (e.g. "This updates your existing saved entry for CVE-2026-55200").
- See §7.1 for the storage-level fix this depends on.

---

## 7. Saved vulnerabilities

### 7.1 Fix the double-entry bug (cache vs. saved)

- The `vulnerabilities` table MUST distinguish rows the user deliberately saved from rows that exist only as NVD lookup cache. Mandated design: add a `saved INTEGER NOT NULL DEFAULT 0` flag (migration, §9). CVE-lookup caching writes/updates rows with `saved = 0`; `POST /api/vulnerabilities` upserts onto the existing row for that CVE/vector (setting `saved = 1`) rather than inserting a sibling; `GET /api/vulnerabilities` returns only `saved = 1` rows.
- Result: looking up a CVE and saving it yields exactly **one** list entry; looking up without saving yields zero list entries (cache row invisible); deleting a saved entry may keep the row as cache (`saved = 0`) or remove it — implementer's choice, but a subsequent lookup MUST still work either way.
- Migration note: existing rows cannot be reliably classified, so the migration sets `saved = 1` on all pre-existing rows (users see what they saw before and can delete strays) — document this in the migration.

### 7.2 Editable saved vulnerabilities

- New route `PUT /api/vulnerabilities/:id` accepting `{ label?, description? }`. New `description TEXT NOT NULL DEFAULT ''` column (migration, §9). Score/vector/CVE identity are **not** editable through this route.
- The saved-vulnerabilities UI gains an **Edit** affordance per entry (pencil icon, §2.2) opening an edit view/panel where the **name (label) is editable** and a **description can be added/edited**; description follows §4 markdown rules (edited as text, rendered as markdown in the list/detail). Save (green) / Cancel (yellow) per §2.2.

### 7.3 Save from CVE lookup carries NVD data

- When saving from the CVE-lookup flow, the client MUST send the NVD payload (or the server MUST copy `nvd_json` from the cache row — the §7.1 upsert makes this natural), so the saved entry's detail view can show the multi-vector `NvdVectorPicker` without requiring a separate re-lookup. This closes v1's documented "known gap".

### 7.4 Result presentation (applies to both the saved detail view and the Scoring page results)

- **Disclosure chevron**: replace the `▾` text character with a proper chevron **icon** (§2.3), larger and more prominent, rotating between collapsed/expanded, consistent everywhere a row expands.
- **Delta figures** (`.delta-up` / `.delta-down` / `.delta-flat`, e.g. `+1.6` / `-1.6` / `±0.0`): render significantly larger/more prominent than today, consistently in both places they appear.
- **"Total:" line** in the why-panel (`ScoreChanges.tsx`): when the total is positive (score increased) it renders **bold red**; negative (score decreased) **bold green**; zero stays neutral. Red/green MUST be theme-aware and contrast-validated (§2.1). Note: green = safer = decreased score; red = more exposed = increased score.
- **More-vulnerable warning**: whenever an environment's modified score is **higher than the base score**, the row/detail MUST state plainly that this environment is *more* exposed than the base score suggests (e.g. a short callout with warning icon: "Higher than the base score — this environment's answers make this vulnerability more severe here."). Shown in both the Scoring results and the saved-vulnerability detail view.

---

## 8. Environments page

### 8.1 Page description

- Replace the current description with clearer, more concise copy for a non-technical user: what an environment is and how it's used.
- Add a **"More" expander** (collapsible/re-collapsible, same component/pattern as §6.1) explaining why environments matter for CVSS — base scores assume worst case; environmental metrics adjust for reality — and how profiles are applied to scores.

### 8.2 List rows

- The action button reads **"Edit"** once an environment exists (replacing "Edit interview"; an environment with no answers yet may keep a distinct "Answer interview" call-to-action). Per §2.2 the Edit affordance is the yellow pencil icon button.
- Edit opens the **environment edit view** (§8.3), from which the interview is reachable — not the interview wizard directly.
- Green status badges follow §2.5.
- Descriptions shown in the list render as markdown (§4).

### 8.3 Environment edit view (new; the Add flow shares these parts where noted)

A dedicated edit view for an environment, exposing what `PUT /api/environments/:id` already supports plus the interview:

- **Rename**: the environment name is editable.
- **Description**: an editable description field (also collected on the **Add/create** form — the create API already accepts it); rendered as markdown wherever displayed.
- **Delete**: a red-outline trash-icon button in the edit view, guarded by the confirmation modal (§2.4).
- **Save / Cancel**: an explicit green "Save" button persists name/description changes; yellow "Cancel" discards them. This replaces the interview's "Save & exit" control in the upper-right (interview answers remain auto-saved per answer as today; "Save & exit" as a labeled control goes away in favor of normal navigation out of the wizard).
- The interview (question wizard) is reached from this view for answering/re-answering.

### 8.4 Question help modal

- On the interview questions, each question gets a **circled `?` icon**; clicking it opens a **modal** (component from §2.4) containing the question's additional information — the `whyWeAsk` help text and, where present, the `finePrint` "what this maps to" disclosure.
- The modal MUST NOT navigate away from the interview, MUST blur the page behind it, and MUST be dismissible (close control + Escape). The inline always-visible help text may be trimmed accordingly, but the fine-print disclosures mandated by v1 §5.2 (Q1, Q4) MUST remain reachable — via this modal is sufficient.

---

## 9. Data model & API changes (summary)

New migration(s) (`server/src/migrations/0002_*.sql`, sequential per v1 rules):

```sql
ALTER TABLE vulnerabilities ADD COLUMN saved INTEGER NOT NULL DEFAULT 0;   -- §7.1
UPDATE vulnerabilities SET saved = 1;                                      -- classify pre-existing rows as saved
ALTER TABLE vulnerabilities ADD COLUMN description TEXT NOT NULL DEFAULT ''; -- §7.2
-- plus whatever storage §6.5's daily major-CVEs cache needs (single-row cache table is fine)
```

API surface changes:

| Route | Change |
|---|---|
| `GET /api/vulnerabilities` | Returns only `saved = 1` rows (§7.1); includes `description` |
| `POST /api/vulnerabilities` | Upserts by CVE ID / normalized vector instead of inserting duplicates; response indicates whether an existing entry was overwritten (§6.6, §7.1); carries NVD data (§7.3) |
| `PUT /api/vulnerabilities/:id` | **New** — edit `label` / `description` (§7.2) |
| `GET /api/major-cves` | **New** — daily-cached top-10 critical CVEs, last 30 days (§6.5) |
| `GET /api/cve/:cveId` | Unchanged externally; cache writes now use `saved = 0` |
| Environments routes | Unchanged — §8 is UI work against the existing API |

Errors stay `{ error: string }` with correct status codes; everything stays under `/api` with the SPA fallback unchanged.

---

## 10. Carried-over v1 gaps (explicitly in scope)

Found unimplemented or partially implemented from the v1 contract; folded into the sections above rather than tracked separately:

1. **`PUT /api/environments/:id` has no UI.** The v1 API route for rename/edit-description exists and is tested, but no screen calls it. Closed by §8.3.
2. **Environment description is never collected.** `POST /api/environments` accepts `(name, description)` per v1 §8, but the create form only takes a name, and descriptions aren't editable anywhere. Closed by §8.3.
3. **Saved-from-CVE loses the NVD payload** (v1's documented "known gap, by design" around `nvd_json` / the vector picker on saved entries). Closed by §7.1 + §7.3.

No other v1 MUST was found unimplemented: scoring parity and the worked example, cap/override behavior, the full catalog with Q1/Q4 fine print, resumable interviews with re-derivation, cache-first CVE lookup with stale-cache fallback, v3.0/v2 version handling, environmental-metrics precedence warning, container/healthcheck requirements, and the §10 test families are all present.

---

## 11. Testing requirements

Vitest; tests remain a release gate. New/updated coverage required:

1. **Saved-vs-cache separation** (§7.1) — a CVE lookup alone adds nothing to `GET /api/vulnerabilities`; lookup + save yields exactly one entry; save-then-lookup-again still one; re-save of the same CVE and of the same pasted vector updates in place (row count stable, fields updated) and the response flags the overwrite.
2. **`PUT /api/vulnerabilities/:id`** — label/description edits persist; vector/score/cve_id are not editable; 404 on unknown id.
3. **NVD data on save** (§7.3) — an entry saved from the CVE flow serves `vectors` on its detail without a fresh lookup.
4. **`GET /api/major-cves`** (§6.5, mocked fetch) — result shape, top-10-by-score selection, 30-day window parameters, cache served without network when fresh, refresh when stale, stale-cache fallback on fetch failure.
5. **Migration** — 0002 applies cleanly on a v1 database; pre-existing vulnerability rows come out `saved = 1`.
6. **Markdown safety** (§4) — description rendering strips/neutralizes raw HTML and script injection (test at the component or utility level).
7. Existing v1 test families (score parity, cap/override, parsing, environments CRUD, cache-first CVE) MUST keep passing unmodified in intent.

UI behavior that Vitest can't reach (tabs order/default, disabled-offline tab + tooltip, modals with blurred backdrop, chevrons, theme toggle persistence, delta/Total styling, overwrite messaging) MUST be verified via the established Playwright + system-Chrome procedure before merge.

---

## 12. Notes & resolved ambiguities

- **"Solid contrast" buttons vs. semantic colors** (§2.1/§2.2): the inversion rule governs neutral/primary/selected controls; Save/Delete/Cancel/Edit keep their semantic colors in both themes. If a conflict arises in a specific spot, semantic color wins for semantic actions.
- **Overwrite question** (from the outline): confirmed the current code creates a *new* entry on every save; this spec mandates overwrite-with-clear-messaging (§6.6), not duplicate-creation.
- **"Updated daily" for Major CVEs** is implemented as a ≤24 h server-side cache with lazy refresh on access (§6.5) — no cron/scheduler in the container.
- **Severity "None" stays colorless** and the severity palette methodology (dataviz-skill validation) carries over unchanged; new semantic colors (green/red/yellow) MUST go through the same validation in both themes.
