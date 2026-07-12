# Fixing a failing test or red CI check

A failing test is a release gate, not advisory feedback. Iterate until green
before moving on or reporting a change as done.

## Diagnosing

1. Read the actual failure output, not just the pass/fail summary. Vitest's
   diff output usually tells you exactly what diverged.
2. If the failure follows a dependency bump (Dependabot or manual), treat it as
   a real incompatibility signal **first**, flakiness **last**. This project's
   own history has several major bumps that surfaced genuine breaking changes
   (a stricter `useRef` type under React 19, a new ESLint rule catching a real
   bug, `toThrowError`'s stricter semantics), see `CHANGELOG.md`'s `1.2.x`
   entries. Don't reach for "probably just flaky, rerun it" before you've read
   what actually broke.
3. If a test's own logic looks suspect (e.g. it depends on shared mutable
   module state, like the NVD throttle), check whether it needs the reset hook
   or isolation pattern already documented in `writing-tests.md` before
   assuming the test itself is wrong.

## What not to do

**Never weaken or delete a mandated test to get to green.** The mandated test
cases listed in `writing-tests.md` exist specifically to lock in invariants
that are easy to accidentally break (zero-answers-reproduces-base-score, the
worked example, the sanitizer safety test, the no-em-dash scan, the red-flags
catalog-integrity check). If a change genuinely requires one of these
expectations to change (the invariant itself is evolving on purpose, not just
inconvenient right now), that's a decision for the user to make explicitly, not
something to route around by editing the assertion or commenting the test out.

Similarly, don't add a broad `try/catch` or a loosened assertion just to make a
red test pass without understanding why it was failing. That converts a real
signal into silence.

## CI specifically

If CI is red on a pushed branch: reproduce locally first (`npm run lint`,
`npm run typecheck`, `npm test`, `npm run build`, matching CI's four checks
exactly), fix, push a new commit, and confirm CI goes green before considering
the change done. Don't merge past a red check under any circumstance
(including the Dependabot autonomous path, where a red check routes to the
`dependabot` skill's red-path workflow instead of being merged).
