---
name: testing
description: Run this skill whenever writing or modifying tests, verifying that a code change actually works, diagnosing a failing test or a red CI check, or performing the pre-merge container verification gate for localscore. Also consult it before claiming any backend or frontend change is "done." It defines the two-tier testing model (npm during development, container as the final gate) that every change in this repo goes through, and the mandated test cases that must never be dropped or weakened.
---

# Testing

localscore treats tests as a release gate, not advisory: a red CI check is
treated exactly like a local test failure, and is never pushed past. This skill
covers every way the repo verifies code: writing tests, running the suites,
driving the UI, fixing failures, and the container gate before merge.

## The two-tier testing model

Don't conflate these two. They serve different purposes and run at different
points in a change's lifecycle.

### Test 2: npm, during development (default)

The default while iterating on a change. Build and run the **built** server
directly on port 8081, not the Vite dev server:

```bash
npm run build && PORT=8081 node server/dist/index.js
```

This matters because it matches how the container actually runs (one process
serving the built frontend + API on one port), without the overhead of a full
container build on every check. Use this for functional checks, API round
trips, and Playwright UI verification throughout the work (see
`resources/ui-verification.md`).

**Always stop the process cleanly when done.** Kill it, don't leave it running
in the background between tasks.

### Test 1: container, last step before merge

The final gate confirming the container builds and runs as it will in
production, on port 8080. Full procedure in `resources/container-test.md`;
the short version:

1. Check whether anything is already bound to port 8080. If a container is
   already there, **ask the user before taking it down**. Don't stop it
   unilaterally.
2. Build fresh, never reuse a stale image: `podman build --format docker -t
   localscore:local .`
3. Run it as `localscore-test`, confirm `/api/health` reports healthy and the
   frontend loads.
4. Clean up afterward. Ask before removing containers/volumes/images.

Run Test 1 once a change is otherwise complete and verified via Test 2, as the
last step before it's ready to ship (the `release` skill's flow expects this to
already be green before it builds a release image).

## Command matrix and mandated test cases

Read `resources/running-tests.md` for the exact commands (`npm test`,
single-file runs, `typecheck`, `lint`, `build`, CI's four-check gate) and
`resources/writing-tests.md` for Vitest conventions and the specific test
cases that must always exist in this codebase (the zero-answers invariant, the
worked example, the markdown sanitizer safety test, and others). These are
not optional coverage, they're regression locks on invariants documented in
`CLAUDE.md`.

## When something fails

Read `resources/fixing-failures.md`. The short version: iterate until green,
treat a post-dependency-bump failure as a real incompatibility signal first
and flakiness last, and never weaken or delete a mandated test to get to
green. If a mandated expectation genuinely needs to change, that's a decision
for the user, not something to route around silently.

## Resources

- `resources/running-tests.md`: the full command matrix and CI's gate.
- `resources/writing-tests.md`: Vitest conventions and mandated test cases.
- `resources/fixing-failures.md`: how to diagnose and resolve a failure.
- `resources/ui-verification.md`: driving the app with Playwright against
  system Chrome, and the pitfalls hit while doing so.
- `resources/container-test.md`: Test 1 in full detail.

## Scripts

- `scripts/smoke.mjs`: starts the built server (or points at a running
  container), polls `/api/health`, hits `/api/catalog` and the frontend's
  `index.html`, and prints one `SMOKE_RESULT ...` line. Useful as a fast
  sanity check after a build, before investing in a full Playwright pass or
  the full container gate. See the script's own `--help` for usage.

For anything release-shaped (version bump, container publish, tag, GitHub
Release), see the `release` skill. That skill's flow gates on this one being
green, but owns the shipping mechanics itself.
