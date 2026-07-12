# Writing tests

## Where tests live

- Server: `server/test/*.test.ts`, run under plain Node via Vitest.
- Web: `web/src/**/*.test.ts`, run under jsdom (see `web/vitest.config.ts`).

## Mocking conventions

- Mock global `fetch` via `vi.stubGlobal("fetch", ...)`. See
  `server/test/cve-route.test.ts` for the established pattern.
- The NVD throttle (a module-level `lastRequestAt` timestamp shared across all
  callers in the process) bleeds across unrelated test cases if you don't reset
  it. Call the test-only reset hook `__resetNvdThrottleForTests` between tests
  that exercise the NVD fetch path, or you'll see spurious 5s+ delays in tests
  that have nothing to do with the throttle.

## New scoring math needs reference vectors, not hand-rolled expectations

Any new or changed scoring logic is only acceptable with test cases validated
against FIRST's reference calculators or another authoritative source, never
an expectation the author computed by hand or guessed at. This is a hard rule,
not a style preference: CVSS math is easy to get subtly wrong, and a
hand-rolled "expected" value just encodes whatever bug produced it.

## Mandated test cases

These must always exist in the suite. If you're refactoring or reorganizing
tests, carry them forward; if a change would remove or weaken one, that's a
sign the change conflicts with an invariant documented in `CLAUDE.md`, and
needs a conversation with the user before proceeding, not a quiet deletion.

- **Zero-answers-reproduces-base-score invariant** (`server/test/scoring.test.ts`):
  an environment with zero interview answers must reproduce the base CVSS
  score exactly, for any pasted vector. This is a core design invariant, not
  just a nice-to-have test.
- **The worked example** (`server/test/scoring.test.ts`): base
  `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = 9.8 against the "Disposable
  Dev Lab" profile must resolve to 0.0 exactly.
- **Markdown sanitizer safety test** (`web/src/lib/markdown.test.ts`): covers
  basic formatting, forced `target="_blank"`/`rel="noopener noreferrer"` link
  attributes, and stripping of `<script>`, inline event-handler attributes,
  `javascript:` URIs, and `<style>`. This is the only place raw description
  text becomes HTML in the app, so this test is a real XSS backstop, not
  boilerplate.
- **Catalog no-em-dash regression scan** (`server/test/catalog.test.ts`): scans
  every catalog question/label/`whyWeAsk`/`finePrint`/`helpDetail` string for
  `—`, enforcing the voice guide (see the `documentation` skill) at the data
  level.
- **Red-flags catalog-integrity test**: asserts every answer referenced by
  `server/src/scoring/redflags.ts` (exported as `REFERENCED_ANSWERS`) actually
  exists in the shipped catalog. Catches a catalog edit that silently breaks a
  red-flag rule's provenance.

If you add a new invariant-style test while working on a feature, note it here
so future changes don't accidentally regress it silently.
