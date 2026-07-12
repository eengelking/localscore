---
name: release
description: Run this skill when finishing any code change destined for main in the localscore repo. It covers opening the PR, bumping the version, publishing a release container image, tagging the release in git, and creating a GitHub Release. This is the default "ship it" path for every code-changing PR, not something to invoke only when explicitly asked. Also consult it for branch/PR mechanics (commit hygiene, gh pr create, watching CI) even on changes that won't get a release (e.g. documentation-only PRs still go through the branch-and-pr flow, just skip the version-bump/publish/tag steps).
---

# Release

The whole ship-a-change lifecycle for localscore: branch, PR, CI, version bump,
container publish, merge, git tag, GitHub Release. Since 1.0.0, **every
code-changing PR merged to `main` gets its own release**. This is a default
part of finishing a change, not a separate step the user needs to request.

## Policy spine

- **Every code-changing PR merged to `main` gets a release**, by default. The
  version bump is bundled into the same PR (the last commit before pushing),
  and the image is built/tagged/pushed from the feature branch pre-merge; only
  the final git tag and GitHub Release wait for the merge itself.
- **Documentation-only PRs get no release**: no version bump, no image, no
  tag. A PR only qualifies as documentation-only if it touches nothing under
  `server/src`, `web/src`, `Dockerfile`, migrations, or other shipped code,
  only `README.md`/`CLAUDE.md`/`docs/*`/comments. A mixed PR (doc changes plus
  any code change) still gets exactly one release for the whole PR; the
  doc-only exception is only for PRs where nothing but docs changed. Doc
  changes in a doc-only PR simply ride along uncaptured until the next
  code-changing release.
- **Bump size**: patch for fixes/small changes, minor for new features, major
  **only on explicit user instruction**. Never infer "major" from diff size
  alone. If it's genuinely ambiguous whether something is patch- or
  minor-sized, ask the user rather than guessing.
- **Open the PR yourself** via `gh pr create` with a real `--title`/`--body`
  (never left to GitHub's commit-message autofill; see
  `resources/branch-and-pr.md` for why that autofill can look broken on a
  long subject line). Watch CI with `gh pr checks --watch`, then report back
  the PR link and pass/fail.
- **Never merge**, except the one documented Dependabot patch/minor autonomous
  exception, which the `dependabot` skill owns end to end (including the
  self-merge). Every other PR, including the ones this skill builds a release
  image for, is merged by the user in the GitHub UI.
- Before committing, run the `documentation` skill's doc-sync check. Gate on
  the `testing` skill: suites green, and the Test 1 container gate for
  anything touching runtime behavior.

## The four steps

1. **`resources/branch-and-pr.md`**: branch off latest `main`, commit-message
   hygiene, opening the PR, watching CI. Read this first for any change headed
   to `main`, release or not.
2. **`resources/version-bump.md`**: the mechanical version bump. All three
   `package.json`s, doc lines quoting the published tag, and rolling
   `CHANGELOG.md`'s `[Unreleased]` into a dated version section (entry-style
   conventions live in the `documentation` skill's `changelog.md`, this
   resource covers the mechanics and timing).
3. **`resources/container-publish.md`**: build, tag, push, and **verify**
   (don't trust exit codes) the release image, then hand off to the
   `attestation` skill.
4. **`resources/tag-and-github-release.md`**: the post-merge steps. Git tag,
   and a GitHub Release built from the CHANGELOG section, not
   `--generate-notes`.

## Scripts

`scripts/` holds the mechanical parts of steps 2-4 as plain Node scripts
(`execFileSync`, not `exec`, to avoid shell-injection via PR titles/bodies).
Each ends with one greppable result line so you don't have to reconstruct
success/failure from raw `podman`/`gh` output:

- **`release-bump.mjs <version> [--note "..."] [--from-pr <n>]`**: performs
  the version-bump mechanics, prints a diffstat, does **not** commit (leaves
  that to you so you can glance at `git diff` first).
- **`release-build.mjs <version>`**: build, then tag both (`<version>` and
  `latest`), then push both, then digest-verify, then a scratch-port health
  smoke, then remove the scratch container. Chatty output goes to
  `.release-logs/` (gitignored); stdout is one `RELEASE_RESULT ...` line.
- **`release-finalize.mjs <pr-number> <version>`**: for the Dependabot green
  path only, squash-merges the PR, then in all cases pulls `main`, tags,
  pushes the tag, extracts the CHANGELOG section, and runs
  `gh release create`. For a normal (non-Dependabot) PR, skip the merge step
  entirely and only run this after the PR is already merged by the user.
  See the script's own usage note. Ends with a `FINALIZE_RESULT ...` line.
- **`podman-cleanup.sh --yes`**: wraps `podman image prune -f` into a
  one-line summary. Requires the explicit `--yes` flag; the ask-before-deleting
  gate from the `testing` skill's cleanup rules still applies, this script
  doesn't bypass it.

Run each script's `--help` (or read its header comment) for exact usage before
invoking it.
