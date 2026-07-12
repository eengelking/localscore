# Contributing to localscore

Thanks for your interest in localscore. This document covers how to get set up, how to run the project's checks, and what's expected of a pull request.

## Before you start

- [`README.md`](./README.md) explains what the project does and why.
- [`CLAUDE.md`](./CLAUDE.md) is the deeper technical reference, covering architecture, API surface, the design system, testing/container/release procedures, and known gotchas. It was written to brief an AI coding agent with no prior context, which makes it equally useful for a human contributor doing the same thing. Skim it before making a non-trivial change.
- [`docs/API.md`](./docs/API.md) documents every API route with curl examples.

## Development setup

Prerequisites: Node.js ≥22 (a `.nvmrc` is checked in, so `nvm use` picks it up automatically).

```bash
git clone https://github.com/eengelking/localscore.git
cd localscore
npm install          # installs all workspaces (server/ and web/)
npm run dev:server   # API on :8080, reloads on change
npm run dev:web      # Vite dev server, proxies /api to :8080 (run alongside dev:server)
```

Open `http://localhost:5173` (Vite's default) for the frontend, or hit `http://localhost:8080/api/...` directly.

Useful environment variables (see `.env.example`): `DATA_DIR` (where the SQLite file lives), `PORT`, and an optional `NVD_API_KEY` if you're doing a lot of CVE lookups and hitting NVD's unauthenticated rate limit.

## Running checks locally

```bash
npm run lint        # eslint, both workspaces
npm run typecheck   # tsc --noEmit, both workspaces
npm test            # vitest, both workspaces
npm run build       # production build, both workspaces
```

These are exactly what CI (`.github/workflows/ci.yml`) runs on every pull request. Run them locally before pushing so you're not waiting on a CI round trip to find a lint error.

To run a single test file: `npm run test --workspace server -- test/catalog.test.ts` (or `--workspace web`).

If you're changing anything in `web/`, also see `CLAUDE.md`'s "Verifying frontend changes" section. This repo doesn't have an automated visual regression suite, so UI changes are verified by actually driving them in a real browser via Playwright, screenshotted in both light and dark theme.

## Branching & commit conventions

- **Never commit directly to `main`.** Branch off the latest `main` for every change.
- Branch names follow a `<type>/<short-description>` pattern, matching this repo's history: `feat/...` for new functionality, `fix/...` for bug fixes, `docs/...` for documentation-only changes, `chore/...` for maintenance (dependency bumps, release prep, tooling). Keep the description short and kebab-case.
- Commit messages are written in the imperative mood ("Add X", "Fix Y", not "Added X" or "Fixes Y"), with a short summary line and, where the *why* isn't obvious from the diff, a body explaining it.
- Prefer one logical change per commit where practical, rather than one giant commit covering unrelated work.

## Pull request expectations

1. Push your branch and open a pull request against `main` on GitHub.
2. Write a PR description that covers what changed and why, and link an issue if there is one.
3. CI must pass (`lint`, `typecheck`, `test`, `build`) before a PR can be merged. This is enforced as a required status check.
4. **Update documentation in the same PR as the behavior change**, not a follow-up: `CLAUDE.md`, `README.md`, and `docs/API.md` as applicable. A PR that changes an API shape or a UI screen without touching the docs that describe it will be asked to add that before merge.
5. Merges are manual (no auto-merge). A maintainer reviews and merges.

## Proposing larger changes

For anything beyond a small fix, such as a new feature, a schema change, a dependency swap, or a UI redesign of an existing screen, open an issue or a discussion describing the proposal *before* writing code. This avoids spending effort on an approach that doesn't fit the project's direction.

A few things worth checking against before proposing something large:

- **The stack is intentionally small**: Hono + better-sqlite3 on the backend, React + Vite with plain CSS (no UI framework) on the frontend, single SQLite file, single container. See `CLAUDE.md`'s "Mandated tech stack" and "Architecture" sections. A proposal that adds a second database, a heavy component library, or a second service should come with a strong justification.
- **UI work goes through a design pass first.** Any new screen or visual change should use the `frontend-design` skill (and the `dataviz` skill for anything color-coding data) before code is written. See `CLAUDE.md`'s "Frontend design" section for why and how this repo's design system evolved the way it did.
- **Scoring changes are held to a high bar.** The scoring engine must match FIRST's reference CVSS calculators exactly, so any change here needs reference-vector test coverage, not just "it looks right."

## Code of Conduct

See [`.github/CODE_OF_CONDUCT.md`](./.github/CODE_OF_CONDUCT.md).

## Reporting issues

Use [GitHub Issues](https://github.com/eengelking/localscore/issues) with the bug report or feature request template, whichever fits.

**Security issues**: please don't file these as public issues. See [`.github/SECURITY.md`](./.github/SECURITY.md) for how to report them privately.

## License

By contributing, you agree that your contributions will be licensed under this project's [MIT License](./LICENSE).
