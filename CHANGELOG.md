# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-07-12

- Upgrade the mandated runtime from Node 22 LTS to Node 24 LTS (the current actual LTS release, since Node 26 doesn't become LTS until October 2026): Dockerfile base image, `.nvmrc`, `engines.node`, and `@types/node`, plus the CLAUDE.md/CONTRIBUTING.md mandate text. Closes #74; supersedes #57 and #61.

## [1.1.5] - 2026-07-12

- Bump `dompurify` from 3.4.11 to 3.4.12 (patch, Dependabot).

## [1.1.4] - 2026-07-12

- Bump `vite` from 5.4.21 to 8.1.4 (major, Dependabot; verified with a full local build and a running-server smoke test of frontend asset serving, the catalog API, and a DB round trip). Note: this alone doesn't clear the known `npm audit` vulnerabilities, see "Known gotchas" in `CLAUDE.md`, since those are rooted in `vitest`'s bundled dependencies, not `vite` directly.

## [1.1.3] - 2026-07-12

- Bump `better-sqlite3` from 11.10.0 to 12.11.1 (major, Dependabot; verified against the built container image, not just CI, since it's a native module).

## [1.1.2] - 2026-07-12

- Bump `typescript` from 5.9.3 to 7.0.2 (major, Dependabot; verified clean typecheck/lint/test/build).

## [1.1.1] - 2026-07-12

- Bump `hono` from 4.12.28 to 4.12.29 (patch, Dependabot).

## [1.1.0] - 2026-07-10

- Environment edit page: profile display, layout fixes, collapsed-by-default risk-warning disclosure, red-flag detection.
- Release workflow: the version bump now lands in the same PR as the feature change instead of a follow-up.

## [1.0.4] - 2026-07-10

- Saved-vulnerabilities page: de-duplicated description display, multi-select severity filter, spacing fix.

## [1.0.3] - 2026-07-10

- Scoring page: prefill the save description from NVD, full-width save form, a clear-result control.
- Added a screenshot to `README.md`.

## [1.0.2] - 2026-07-10

- Workflow change only: PRs are opened via the `gh` CLI going forward.

## [1.0.1] - 2026-07-10

- Adopted the `gh` CLI for GitHub operations, added an issue-triage workflow, and automated the release process (version bump, image build/tag/push, git tag).

## [1.0.0] - 2026-07-10

First stable release. The product works end to end:

- Full ~12-question interview catalog and environment CRUD with answer-derivation.
- Scoring engine covering CVSS v4.0, v3.1, and v3.0 (scored with v3.1's equations, disclosed in the UI), validated against FIRST's reference vectors.
- NVD CVE lookup, cache-first and throttled, tolerant of NVD being unreachable.
- Saved-vulnerability CRUD with full-content search.
- A complete design system with light/dark theming.
- A container image under 300 MB with a `HEALTHCHECK`, published to Docker Hub.

## [0.2.0] - 2026-07-09

- UI polish pass: real tabs, offline detection, error banners, a Major CVEs feed, expanded CVE detail rendering.

## [0.1.0] - 2026-07-09

- Initial project scaffold: monorepo, SQLite database and migrations, question catalog, environment CRUD, the CVSS scoring engine, and the first version of the frontend (environments list, interview wizard, results screen).

[Unreleased]: https://github.com/eengelking/localscore/compare/1.2.0...HEAD
[1.2.0]: https://github.com/eengelking/localscore/compare/1.1.5...1.2.0
[1.1.5]: https://github.com/eengelking/localscore/compare/1.1.4...1.1.5
[1.1.4]: https://github.com/eengelking/localscore/compare/1.1.3...1.1.4
[1.1.3]: https://github.com/eengelking/localscore/compare/1.1.2...1.1.3
[1.1.2]: https://github.com/eengelking/localscore/compare/1.1.1...1.1.2
[1.1.1]: https://github.com/eengelking/localscore/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/eengelking/localscore/compare/1.0.4...1.1.0
[1.0.4]: https://github.com/eengelking/localscore/compare/1.0.3...1.0.4
[1.0.3]: https://github.com/eengelking/localscore/compare/1.0.2...1.0.3
[1.0.2]: https://github.com/eengelking/localscore/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/eengelking/localscore/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/eengelking/localscore/compare/0.2.0...1.0.0
[0.2.0]: https://github.com/eengelking/localscore/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/eengelking/localscore/releases/tag/0.1.0
