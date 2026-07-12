---
name: dependabot
description: Run this skill when handling, triaging, merging, or investigating Dependabot pull requests or any other automated dependency update PR in the localscore repo. Covers noticing open Dependabot PRs, classifying patch/minor/major, the pre-authorized autonomous flow for green patch/minor bumps (including the self-merge), and the red-CI path for a broken update (file an issue, close the PR, defer the fix). Consult this before merging or closing any PR authored by app/dependabot.
---

# Dependabot

`.github/dependabot.yml` opens PRs automatically for npm, GitHub Actions, and
Docker base image updates. These arrive without a branch-off-main step or an
explicit ask from the user, but they still change what ships in the container,
so they still go through this project's version-bump/release workflow.
Handle them deliberately rather than ignoring them or merging on sight.

## Triage

```bash
gh pr list --author app/dependabot
```

**The login is `app/dependabot`, not `app/dependabot[bot]`.** The `[bot]`
suffix form matches nothing in `gh`'s author filter and also globs badly in
zsh. This was rediscovered the hard way once already on this project, so
don't retry it.

Classify each open PR's semver jump (patch/minor/major) from the `from X to Y`
in its title, a simple regex/semver comparison, no need to fetch or read the
full PR body for that. Only read the body or linked release notes when a
security or breaking-change signal is worth flagging (a `security`/`breaking`
keyword, or it's a major bump you're about to summarize for the user).
`scripts/dependabot-triage.mjs` automates this classification and prints one
compact line per PR.

## Before acting on any PR

1. **Let the PR's own CI resolve first.** Don't act on a Dependabot PR before
   its check has finished. A red check on a dependency bump is a real signal
   worth investigating, not noise to route around.
2. **Check whether the branch is behind `main`.**
   `gh pr view <number> --json mergeStateStatus` reports `BEHIND` when GitHub
   would show a "This branch is out-of-date with the base branch" banner. If
   so, run `gh pr update-branch <number>` and wait for that branch's CI to
   finish again before doing anything else with it. An out-of-date branch can
   hide a conflict with something that merged into `main` after Dependabot
   opened the PR, and a release image built from stale code defeats the
   purpose of building from the branch at all.

## Route on CI outcome

- **Green + up to date + patch/minor**: `resources/green-path.md`, the
  pre-authorized autonomous flow. No need to check with the user first.
- **Red CI, or an update otherwise found broken**: `resources/red-path.md`,
  the new file-an-issue-and-close workflow (this replaces "investigate in
  place" as this project's convention).
- **Major bump, regardless of CI color**: never merged or built
  automatically. Summarize the breaking-change risk for the user (check this
  repo's known gotchas, e.g. the `vite`/`vitest` `npm audit` interlock noted
  in `CLAUDE.md`) and wait for an explicit go-ahead, same as any other
  major-version decision on this project.

## When uncertain, ask

**When uncertain about any Dependabot finding (an ambiguous changelog, a
suspicious diff, an unclear security note), ask the user. Always.**
Uncertainty is never resolved by merging. This applies even to a patch/minor
bump that would otherwise qualify for the autonomous green path: if something
about it doesn't add up, that overrides the pre-authorization.

## Resources

- `resources/green-path.md`: the pre-authorized autonomous flow for
  patch/minor with green CI and an up-to-date branch, ending in a self-merge
  and full release.
- `resources/red-path.md`: file an issue referencing the PR, close the PR,
  defer the actual fix to explicit pickup.

## Scripts

- `scripts/dependabot-triage.mjs`: one compact line per open Dependabot PR
  (`#78  marked  18.0.5 -> 18.0.6  patch  ci=pass  branch=CLEAN`), semver
  classification from the title, small `--json statusCheckRollup,
  mergeStateStatus` payloads instead of full PR bodies. Supports `--watch` to
  poll and only print on status change. Ends with a `TRIAGE_RESULT ...` line.
