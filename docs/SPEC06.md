# localscore — Specification v1.5 ("SPEC06")

This document is the **active implementation contract** for the next round of work. It supersedes `SPEC05.md` (the v1.4 contract), which is fully implemented and now historical, the same way SPEC05 superseded `SPEC04.md`. Treat every **MUST/MUST NOT** here as a hard requirement and every **SHOULD** as the default unless there is a documented reason to deviate.

**Everything in the v1/v1.1/v1.2/v1.3/v1.4 contracts that this document does not change remains binding** — in particular:

- Scoring math MUST match FIRST's reference calculators exactly (v4.0 / v3.1); the worked example (base 9.8 → "Disposable Dev Lab" 0.0) and the empty-profile identity remain required tests.
- Cap/override semantics, the question catalog's **metric effects**, and the answers-are-source-of-truth data model are unchanged.
- The mandated tech stack is unchanged: Node 22 + TypeScript strict, Hono, React + Vite, plain CSS custom properties (no UI framework, no component library with a large runtime), better-sqlite3 with sequential SQL migrations, Vitest, single container on port 8080.
- The app MUST remain fully functional offline. The only permitted outbound network calls are the NVD lookups. No CDN assets of any kind.
- The design system remains in force: semantic action colors (SPEC02 §2.2 as amended by SPEC05 §2.2), the shared Modal, the severity palette's reserved status, the SPEC04 accent-chrome system (as amended by SPEC05 §5.3), and contrast validation via the `dataviz` skill's `validate_palette.js` + WCAG math for any color tied to data or semantics. **This spec amends two specific layout rules** (the Saved-row action-cluster position — §5.1 of SPEC05; the NVD-link placement inside the CVE details — §5.4 of SPEC05); everything else stands.
- No em-dashes in any user-facing string (SPEC03 §2.2); the product name renders bold in body copy (SPEC03 §2.1); button-like labels use Title Case (SPEC04 §3). All copy added under this spec follows all three rules.
- UI/visual work MUST go through the `frontend-design` skill before writing JSX/CSS; data-tied colors additionally through the `dataviz` skill (per CLAUDE.md's standing instruction).
- Markdown descriptions everywhere continue to flow through the one shared render path (`renderMarkdown` → DOMPurify → `MarkdownContent`, SPEC02 §4) — no second renderer, no unsanitized `dangerouslySetInnerHTML`.

Scope of v1.5: **input hygiene** (stripping wrapping quotes users copy from the example placeholders), a **readability rework of the environment risk callout**, **Scoring-page fixes** (a description field at save time, stale-result reset on a new lookup, a full-width lookup-error banner, an unclamped CVE description, a relocated NVD link), and a **Saved-page round** (action cluster moves to the lower right, plus new type/severity filters and a full-content search).

**Implementation status: not yet implemented.** This is the to-do list.

---

## 1. Current-state findings (what's wrong today)

Codebase review, 2026-07-09, against `main` at 42aa9e6. File/line references are anchors, not exhaustive lists — implementers MUST search for siblings of each pattern.

1. **Quoted placeholder examples teach users to type quotes.** The create form's name and location inputs (`EnvironmentsPage.tsx:93,107`) and the edit view's location input (`EnvironmentEditPage.tsx:172`) show placeholders like `e.g. "My Data Center"`. Users copy the convention, type `"My Data Center"` with the quotes, and the server stores them verbatim (it only trims whitespace — `environments.ts:101`), so quoted names show up in the environments list. This happened to the user during testing.
2. **The risk-warning callout is hard to read.** In `EnvironmentEditPage.tsx:112-154`, each `.callout-section` renders an explanatory paragraph and then a `.raises-scores-list` whose items put the bolded question text and the chosen answer on **one line** with nothing but a space between them (`EnvironmentEditPage.tsx:126-131,142-146`), separated by only `gap: var(--space-1)` (`styles.css:1512-1519`). Adjacent question/answer pairs blur together; the list isn't visually indented under its paragraph.
3. **A scored result can't be given a description at save time.** `ScoreResult.tsx`'s save panel (lines 69-105) collects only a label. A description can only be added afterwards via the Saved page's edit form, and `POST /api/vulnerabilities` (`vulnerabilities.ts:62-120`) doesn't accept a `description` field from the client at all (only the NVD prefill path ever sets one at save time).
4. **The CVE-details NVD link sits oddly at the top.** SPEC05 §5.4 suggested "top of the expanded body" and that's what shipped (`CveDetailsView.tsx:49-59`) — the user finds it looks stranded above the description and wants it in the **lower right** of the expanded details instead.
5. **The CVE-lookup error banner isn't full width.** `WarningBanner` renders inside the CVE tab's `.card.tab-panel.score-form` (`ScorePage.tsx:316`), whose `align-items: flex-start` (`styles.css:1241-1246`) shrink-wraps children that don't opt into full width — the same root cause SPEC03 §7.3 already fixed for `.cve-lookup-result` (`styles.css:1252-1256`). The callout stops at its content width instead of filling the panel.
6. **The CVE description still carries a "Show More" clamp.** `CveDetailsView.tsx:5,22-23,61-69` truncates the description at 320 chars behind a Show More/Show Less toggle. That clamp predates SPEC04 §5.2's collapsed-by-default disclosure; now that the whole details block is opt-in, clamping the description *inside* the expanded state is a leftover with no purpose.
7. **A stale scored result survives a new lookup.** After "Score It" produces a result, looking up a different CVE leaves the previous result rendered below the tabs (`ScorePage.tsx:129-153` never clears `result`/`lookupSource`), so the page shows CVE B's details above CVE A's scores until the user thinks to press "Score It" again. The same staleness applies to the paste tab: editing the vector after scoring keeps the old result, and switching the selected vector in the NVD picker (`setSelectedVectorIndex`) does too.
8. **The Saved-row action cluster is pinned top-right; the user wants it bottom-right.** SPEC05 §5.1 mandated `align-items: flex-start` on `.vulnerability-row-header` (`styles.css:2023-2031`), which pins the eye/edit/delete cluster to the top-right of the card. The user has reviewed the result and wants the cluster anchored to the **lower right** of the header instead.
9. **The Saved page has no filtering or search.** `SavedVulnerabilitiesPage.tsx` renders the full list unconditionally. There's no way to narrow by source (NVD vs. pasted vector) or severity, and no way to search — even though the database holds label, CVE ID, vector, description, and the full cached NVD payload (description, affected products, references) per row. `GET /api/vulnerabilities` (`vulnerabilities.ts:55-60`) takes no query parameters.

---

## 2. Environments

### 2.1 Strip wrapping quotes from name and location

- **Server**: `POST /api/environments` and `PUT /api/environments/:id` MUST normalize the `name` and `location` fields by, after the existing trim, **removing one matched pair of wrapping quotes** when the entire value is enclosed in them — straight double (`"…"`), straight single (`'…'`), curly double (`“…”`), and curly single (`‘…’`). Re-trim after stripping, and repeat until the value no longer starts and ends with a matched pair (so `"'My Lab'"` comes out as `My Lab`). Unmatched or interior quotes are untouched: `Bob's Lab`, `"quoted" prefix`, and `say "hi"` all pass through unchanged. A value that becomes empty after stripping is treated exactly as an empty submission is today (name: 400; location: stored as `""`).
- Implement it once as a small shared helper (suggested: `server/src/lib/strings.ts`, e.g. `stripWrappingQuotes()`), used by both routes — not two inline copies.
- **Scope**: environment `name` and `location` only. The markdown `description` MUST NOT be quote-stripped (quotes are legitimate content there), and saved-vulnerability labels are out of scope for this round.
- **Placeholders stop modeling quotes**: update the example placeholders so they no longer show quoted strings — `e.g. My Data Center` and `e.g. us-east-1 or Building 4, rack 12` (exact copy is the implementer's, in the app's register; the contract is that no placeholder in the create or edit forms displays quotation marks around an example value). This removes the prompt that caused the bad input in the first place; the server-side strip is the backstop for users who quote anyway.

### 2.2 Risk-warning callout becomes readable

The callout content and trigger logic (SPEC05 §3.2) are unchanged — this is purely presentation, in `EnvironmentEditPage.tsx` and `styles.css`. Mandated structure per `.callout-section`:

- **The section's title and explanatory paragraph are grouped in their own block** (e.g. a `.callout-section-intro` div holding the existing `.callout-section-title` and the context paragraph), visually distinct from the list of responsible answers that follows. The current copy stays as-is.
- **The answer list is indented** relative to the intro block (`.raises-scores-list` gains a left padding/margin — around `var(--space-4)`, frontend-design judgment), so the structure reads as "statement, then supporting evidence."
- **Each question and each answer gets its own line.** Within one list item:
  - The question line starts with a bold **`Q:`** followed by a space, then the question text. The `Q:` prefix MUST be bold; keep the question text at its current bold weight so the pair reads as today, just prefixed and on its own line.
  - The answer line starts with a normal-weight `A:` followed by a space, then the chosen answer text, normal weight.
- **Space between successive question/answer pairs increases** so each pair reads as its own unit — bump the list's item gap from `var(--space-1)` to at least `var(--space-3)` (`styles.css:1518`), verified visually with a flag whose provenance spans two or more answers (e.g. `uncertain_recovery` triggered by Q5 Catastrophic + Q10 Uncertain) and with the multi-answer Q8 stepping-stone raising case.
- Both consumers of `.raises-scores-list` get the treatment automatically (the score-raising section and every red-flag block use the same list class) — do not fork the class.
- Copy rules apply as always (no em-dashes, non-technical register). No API change.

---

## 3. Scoring page

### 3.1 Description at save time (extends SPEC02 §6.6's save flow)

- **`ScoreResult.tsx`'s save panel** gains an optional description `.textarea` below the existing label input, with placeholder/help copy noting markdown is supported (mirror the Saved-page edit form's copy: "Notes about this vulnerability. Markdown supported."). Because `ScoreResult` is shared, both the pasted-vector flow and the CVE-lookup flow get the field — that's intended.
- **`POST /api/vulnerabilities`** accepts an optional `description` string. Semantics against the existing upsert (`vulnerabilities.ts:62-120`):
  - A **non-empty** client `description` is stored, on both the insert and the update path — an explicit description from the save form wins over whatever the matched row had, and over the NVD prefill.
  - An **empty/absent** client `description` changes nothing about today's behavior: an update keeps the existing row's description; a fresh NVD-sourced save still gets the SPEC04 §5.1 prefill; a fresh pasted-vector save stays empty. (In other words: the prefill only fires when the description is *still* empty after the client's value is considered — the existing "never overwrite a non-empty description" rule now also covers the client-supplied one.)
- **Rendering needs no new work**: `vulnerabilities.description` already exists, is already returned by the list/detail routes, and already renders through `MarkdownContent` on the Saved page (SPEC02 §7.2). Do not add a second markdown path.
- Mirror the request shape in `web/src/api.ts`'s `saveVulnerability()` and `web/src/types.ts`; document in `API.md`.

### 3.2 Stale scored result resets (new invariant)

The rule: **a rendered score result is only valid for the exact input that produced it.** Whenever that input changes, the result MUST clear (along with `lookupSource` and any save-panel state riding on it), so the page makes it obvious the user needs to press "Score It" again. Concretely, in `ScorePage.tsx`, clear `result` when:

1. **A new CVE lookup is initiated** — the lookup form submits, a Major-CVE row is clicked, or the "Refresh" link re-fetches. All go through `performCveLookup()` (`ScorePage.tsx:129`), so one clearing point covers them. (Refresh of the same CVE also clears: NVD data can change between fetches, and one uniform rule beats a special case.)
2. **The vector textarea's content changes** while a result is showing (`ScorePage.tsx:280-282`) — pasting or editing a vector invalidates the previous score.
3. **A different vector is selected in the NVD vector picker** (`setSelectedVectorIndex`, `ScorePage.tsx:338`) — the result no longer corresponds to the selected vector.
- Clearing MUST NOT wipe the *lookup* itself: after a new lookup, the fresh CVE's details/vector picker render as they do today; only the scored-result block below disappears until "Score It" is pressed again.
- Failed scoring already clears the result (`ScorePage.tsx:122,171`); keep that.
- Note this invariant in a code comment at the clearing site(s) so future inputs (e.g. a hypothetical severity re-fetch) inherit it deliberately rather than by accident.

### 3.3 Lookup-error banner spans the panel

- The `WarningBanner` rendered for `cveError` (`ScorePage.tsx:316`) MUST span the full width of the `.tab-panel` it sits in. Root cause is `.score-form`'s `align-items: flex-start` (`styles.css:1241-1246`); fix the same way SPEC03 §7.3 fixed `.cve-lookup-result` — e.g. `.score-form .callout-warning { width: 100%; }` or `width: 100%` on the banner's root — and note the sibling precedent in the CSS comment.
- Check the other in-panel `WarningBanner` uses (the Major CVEs tab's error at `ScorePage.tsx:360`) render full-width too after the change; the fix SHOULD cover them uniformly rather than special-casing the CVE tab.

### 3.4 CVE description loses its clamp (amends SPEC04 §5.2)

- Remove the Show More/Show Less description clamp from `CveDetailsView.tsx` entirely (`DESCRIPTION_CLAMP_LENGTH`, `expanded` state, `isLong`/`shownDescription`, the toggle button — `CveDetailsView.tsx:5,20-23,61-69`). When the details disclosure is expanded, the **entire** description renders. The disclosure itself (collapsed by default, SPEC04 §5.2) is what bounds the page now; the inner clamp is a leftover from when the details block was always visible.
- SPEC05 §5.2's "the internal Show More/Show Less clamp is unchanged" clause is hereby superseded.

### 3.5 NVD link moves to the lower right (amends SPEC05 §5.4)

- The NVD external link inside the expanded `.cve-details-body` moves from the top (`CveDetailsView.tsx:49-59`) to the **bottom right** of the expanded details. It MUST sit in its own block (its own div/layer, per the user's framing) as the body's final row, right-aligned — sharing the last visual line with whatever content ends the left side rather than pushing a lonely full-height row (e.g. a flex footer row with the link at `margin-left: auto`, or `align-self: flex-end` on the body's column layout; frontend-design judgment on the exact mechanism).
- Everything else about the link stands (SPEC05 §5.4): same URL scheme, `target="_blank" rel="noopener noreferrer"`, `Icon name="external-link"` grammar, rendered only when `cveId` is present, and — because it stays inside the body, not the summary button — still no `stopPropagation` needed.
- Verify in both consumers (Scoring-page lookup, Saved-page expanded row), both themes.

---

## 4. Saved page

### 4.1 Action cluster moves to the lower right (amends SPEC05 §5.1)

- The eye/edit/delete cluster (`.environment-row-actions`) MUST anchor to the **bottom right** of `.vulnerability-row-header` — bottom-aligned with the header's content — instead of SPEC05's top-right. Likely one-line shape: `align-items: flex-end` on the header (or `align-self: flex-end` on the actions column), replacing the current `flex-start` (`styles.css:2025`).
- Everything else SPEC05 §5.1 established stands: `flex-wrap: nowrap` at desktop, the deliberate stacked layout at ≤480px, `min-width: 0` + `overflow-wrap: anywhere` on the text column, `flex-shrink: 0` on the actions. Re-run the SPEC05 verification matrix (plain row, multi-line-description row, maximal unbroken-vector-label row; desktop and 480px; both themes) asserting the cluster's bottom edge tracks the header's bottom edge.

### 4.2 Filter and search (new feature)

The Saved page gains a control bar between the page header and the list, with two orthogonal narrowing mechanisms that combine (logical AND). The `frontend-design` skill governs the bar's exact presentation (chips vs. selects, spacing, empty-state copy).

#### 4.2.1 Filters (client-side)

- **Type filter**: All / NVD / Pasted vector — matches each row's existing `source` field (`"nvd"` / `"vector"`).
- **Severity filter**: All / Critical / High / Medium / Low — matches the severity derived from `baseScore` via the existing `nvdSeverityToAppSeverity("", baseScore)` (`web/src/lib/severity.ts`), i.e. **exactly the same mapping the row's severity pill displays**, so a row never filters into a bucket different from its visible pill. (A 0.0-score row maps to None and appears only under All — acceptable and worth a code comment, not a fifth filter option.)
- Both filters operate client-side on the already-fetched list — the data is in every list row today; no API change for filtering.
- Only matching rows render; the active filter state is visibly indicated. When the combined narrowing yields nothing, show a "no matches" empty state (distinct copy from the no-saved-items-at-all state, which only shows when the unfiltered list is empty).

#### 4.2.2 Search (server-side)

- **API**: `GET /api/vulnerabilities` accepts an optional `q` query parameter — a case-insensitive substring match. A row matches when `q` appears in **any** of: `label`, `cve_id`, `vector`, `description`, or the raw `nvd_json` text (which is what makes the NVD description, affected products/CPE strings, and reference URLs/tags searchable without new columns or extraction at query time). Continues to return only `saved = 1` rows, same ordering, full existing row shape. Absent/blank `q` returns everything, exactly as today.
- Implementation notes: one `LIKE`-per-column `OR` chain (or a single `LIKE` over a concatenation) with SQLite's `ESCAPE` clause — the user's `%`/`_` characters MUST be escaped so they match literally, not as wildcards. `LOWER()` both sides (SQLite's default `LIKE` is only ASCII-case-insensitive; that's acceptable and worth a comment — do **not** reach for FTS5 or a new index for a personal-scale list). No new migration.
- **UI**: a search `.input` in the control bar, debounced (~250-300ms) into the `q`-parameterized fetch, combined with the client-side filters above (server narrows by text; client narrows the response by type/severity). Clearing the box restores the unsearched list. Searching MUST NOT disturb an expanded row that still matches; a viewed row that stops matching collapses with the rest.
- Document `q` in `API.md`; mirror in `api.ts`'s `listVulnerabilities()` (optional argument, so existing no-arg callers — `ScorePage.tsx`'s overwrite-detection fetch — are untouched and keep fetching the full list).

---

## 5. Data model & API changes (summary)

**No migrations.** Two route changes:

| Route | Change |
|---|---|
| `POST /api/vulnerabilities` | Accepts optional `description`; non-empty wins over existing/prefill, empty preserves today's behavior (§3.1) |
| `GET /api/vulnerabilities` | Accepts optional `q` — case-insensitive substring search over label, CVE ID, vector, description, and cached NVD JSON (§4.2.2) |
| `POST /api/environments`, `PUT /api/environments/:id` | Behavior refinement, no shape change: `name`/`location` are quote-stripped per §2.1 |
| All other routes | Unchanged |

Errors stay `{ error: string }` with correct status codes. `API.md` MUST be updated for the changed routes in the same change.

---

## 6. Testing requirements

Vitest; tests remain a release gate. New/updated coverage required:

1. **Quote stripping** (§2.1): each quote style stripped on create and update, for both `name` and `location`; nested pairs fully stripped; interior/unmatched quotes preserved (`Bob's Lab`, `say "hi"`); whitespace-inside-quotes trimmed (`" My Lab "` → `My Lab`); a name that is only quotes rejects as empty (400); description is never stripped.
2. **Save-time description** (§3.1): POST with a description stores it (insert path); POST with a description onto an existing saved row overwrites (update path); POST with a description beats the NVD prefill; POST without one keeps every existing behavior (prefill fires for CVE saves, pasted-vector saves stay empty, re-save of an edited row leaves the edit alone — the existing SPEC04 §5.1 test block keeps passing).
3. **Search** (§4.2.2): `q` matches against each of the five fields individually (label, CVE ID, vector, description, NVD-JSON content such as an affected-product string); matching is case-insensitive; `%`/`_` in `q` match literally; blank/absent `q` returns all saved rows; `saved = 0` cache rows never surface regardless of match.
4. Existing test families (score parity, cap/override, environments CRUD, raising/red flags, saved-vs-cache upsert, catalog copy rules, major-CVEs cache, markdown safety, CVE details extraction, description prefill) MUST keep passing unmodified in intent.

UI behavior Vitest can't reach MUST be verified via the established Playwright + system-Chrome procedure, in **both themes**, before merge:

- Environments: creating an environment by typing a quoted name/location shows it unquoted in the list; placeholders show no quoted examples.
- Risk callout: for an environment triggering both tiers with multi-answer provenance — intro block visually grouped, list indented, each pair rendered as a bold-`Q:` line over a normal-`A:` line, clear vertical separation between pairs.
- Scoring: save panel offers label + description and a markdown description round-trips to the Saved page's rendered row; after scoring CVE A, looking up CVE B removes the old result until "Score It" is pressed; editing a scored vector clears the result; switching the NVD vector picker clears the result; a failed CVE lookup's error banner spans the full panel width; an expanded CVE detail shows the entire long description with no Show More; the NVD link sits at the lower right of the expanded details in both the Scoring and Saved consumers.
- Saved: eye/edit/delete cluster bottom-right on plain, long-description, and long-vector-label rows at desktop (480px stacked layout intact); type and severity filters narrow the list and combine; the severity filter agrees with each row's pill; search narrows by label, CVE ID, vector, description text, and an NVD affected-product string; filter+search combine; the two empty states (no saves at all vs. no matches) are distinct.

---

## 7. Notes & resolved ambiguities

- **Quote stripping is server-side, plus placeholder copy** — the placeholders caused the behavior, so they stop modeling quotes; the server strip is the backstop (and fixes API-only callers too). Stripping only fires on a *matched wrapping pair* so legitimate quotes inside values are never mangled. It is deliberately limited to the two short plain-text identity fields; markdown descriptions keep quotes verbatim.
- **`Q:`/`A:` formatting is prescriptive because the user prescribed it** — bold `Q:` prefix, normal `A:` prefix, own lines, wider inter-pair spacing, indented list under a grouped intro. The existing bold question text stays bold; only the layout around it changes.
- **The save-form description wins over the NVD prefill** — an explicit user-typed description at save time is the strongest signal; the prefill remains a fallback for empty descriptions only, preserving SPEC04 §5.1's "never overwrite a non-empty description" rule with the client's value simply considered first.
- **Result-clearing is an invariant, not a patch** — the contract is "a result is only valid for the input that produced it," enumerated at the three places input changes today (new lookup, vector edit, picker change) so the next input source added inherits the rule consciously. Refresh clears too, by design: one rule, no same-ID carve-out.
- **Search is server-side; filters are client-side** — the type/severity facets exist in every list row already, so filtering them locally is instant and needs no API. Search has to reach the cached `nvd_json` (affected products, NVD description, references), which the list response deliberately doesn't carry — a `q` parameter with a `LIKE` over the raw JSON text gets full-content search with no schema change, no extraction pass, and no FTS machinery, which is the right weight for a personal-scale saved list.
- **Severity filter buckets reuse the pill's mapping** (`nvdSeverityToAppSeverity` on `baseScore`) so the filter can never disagree with what the row visibly shows. `None` is deliberately not a filter option, consistent with the design system's "None has no hue" stance; such rows simply live under All.
- **Two SPEC05 placements are amended, not re-litigated** — the action cluster's `flex-start` becomes `flex-end` (SPEC05 §5.1's wrap fix, text-column protections, and 480px layout all stand), and the NVD link moves from the body's top to a bottom-right footer row (SPEC05 §5.4's grammar, URL, and no-`stopPropagation` reasoning all stand). The Show More clamp's removal likewise supersedes only the single "clamp is unchanged" clause of SPEC05 §5.2.
