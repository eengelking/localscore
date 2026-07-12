# CHANGELOG.md conventions

`CHANGELOG.md` follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
loosely, with [SemVer](https://semver.org/). Read the actual file before adding
an entry. The examples below are real entries from this repo's history, not
invented ones, and the current file's tail is the best guide to current style.

## Structure

- An `## [Unreleased]` section is always present at the top, even when empty.
  New, not-yet-released changes get a bullet added under it as they land.
- Each release gets exactly one `## [<version>] - <YYYY-MM-DD>` heading, newest
  first, directly below `[Unreleased]`.
- Compare-link references sit at the bottom of the file, one per released
  version, in the same descending order as the headings above:

  ```
  [Unreleased]: https://github.com/eengelking/localscore/compare/1.2.7...HEAD
  [1.2.7]: https://github.com/eengelking/localscore/compare/1.2.6...1.2.7
  ```

  The oldest version (`0.1.0` in this repo) links to `releases/tag/0.1.0`
  instead of a compare link, since there's no prior tag to compare against.

## Entry style

Plain bullets, no headers-within-a-release-section unless the release genuinely
has multiple unrelated threads of work (rare, most releases here are a single
bullet).

**Trivial dependency bumps** (patch or minor, nothing to verify beyond CI
passing) get one line:

```
- Bump `marked` from 18.0.5 to 18.0.6 (patch, Dependabot).
```

**Major dependency bumps** get a paragraph, since a major bump is a real
verification event, not a rubber stamp. The established pattern (see
`1.2.3`–`1.2.7` in the actual file) records three things concretely: what
breaking changes were checked for, what (if anything) had to actually change in
this codebase, and how it was verified. For example:

```
- Bump `vitest` from 2.1.9 to 4.1.10 (major, Dependabot-originated but
  hand-verified). No config changes needed: neither `server/vitest.config.ts`
  nor `web/vitest.config.ts` uses coverage, pool/thread options, or
  workspace/projects config, and no test file relies on the mocking APIs that
  changed behavior (`vi.useFakeTimers`, `mockReset`, `spyOn` on an
  already-mocked method). ... Lint, typecheck, full test suite (166 tests), and
  build all verified clean with no code changes required.
```

Don't write a vague "verified, no issues." Name the specific breaking changes
in that release's notes that were checked against this codebase's actual usage,
and name the specific verification steps taken (which suites, whether a running
server or container was smoke-tested, whether Playwright covered a
user-visible flow). A reader should be able to tell *why* the bump was safe,
not just that someone asserts it was.

**Feature/fix entries** are a plain present-tense-free description of what
changed, from the user or maintainer's point of view, not a diff summary:

```
- Environment edit page: profile display, layout fixes, collapsed-by-default
  risk-warning disclosure, red-flag detection.
```

Reference closed issues/PRs where relevant (`Closes #74; supersedes #57 and
#61.`) so the changelog doubles as a light audit trail.

## Prose

Changelog prose follows this skill's voice guide (see `SKILL.md`): no
em-dashes, no formulaic constructions, no marketing filler. Say what changed
and why it's safe, plainly.

## When this fires

Rolling `[Unreleased]` into a new `## [<version>] - <date>` heading plus the
compare-link is part of the `release` skill's version-bump step, not something
done ad hoc. See that skill for the full mechanical procedure (which package.json
files also get bumped, when this step runs relative to the PR/build/push
sequence). This resource covers the *content and style* of what goes in the
changelog; `release` owns *when* and *how* the file gets edited as part of
shipping a version.
