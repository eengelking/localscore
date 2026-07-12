# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/eengelking/localscore/compare/1.1.2...HEAD
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
