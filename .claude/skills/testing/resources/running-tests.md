# Running tests: the command matrix

All commands run from the repo root unless noted.

| Purpose | Command |
|---|---|
| Full test suite (server then web) | `npm test` |
| Single server test file | `npm run test --workspace server -- test/catalog.test.ts` |
| Single web test file | `npm run test --workspace web -- src/lib/markdown.test.ts` |
| Typecheck (both workspaces) | `npm run typecheck` |
| Lint (both workspaces) | `npm run lint` |
| Build (web then server) | `npm run build` |
| Run the built server | `npm start` (equivalent to `node server/dist/index.js`, but for manual verification prefer `PORT=8081 node server/dist/index.js` per the Test 2 procedure in `SKILL.md`) |

`npm test` runs the server's Vitest suite (`server/test/*.test.ts`) first, then
the web's (`web/src/**/*.test.ts`, jsdom environment, see
`web/vitest.config.ts`).

## CI

`.github/workflows/ci.yml` runs all four checks (`lint`, `typecheck`, `test`,
`build`) on every PR and every push to `main`. Treat a red check exactly like a
local failure. Never push past it, and never merge a PR with a red check
(this applies to Dependabot PRs too, see the `dependabot` skill).

## Timeout note

`server/vitest.config.ts` sets `testTimeout: 15000` project-wide (the default
5s isn't enough). This exists because `server/test/major-cves-route.test.ts`'s
tests that exercise the real NVD fetch path make two throttled calls each
(~6s apart unauthenticated, per a shared module-level rate limiter), so those
specific test cases take ~6s each. If you add a new suite that also hits a
throttled or otherwise slow path, don't assume the default timeout is enough.
Check whether this project-wide setting already covers it before adding a
per-test override.
