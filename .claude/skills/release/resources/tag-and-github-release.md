# Tag and GitHub Release (post-merge)

This is the only part of the release flow that waits for the PR to actually
merge. Everything in `version-bump.md` and `container-publish.md` happens
pre-merge, on the feature branch.

## Git tag

```bash
git checkout main && git pull
git tag -a <version> -m "<version>"
git push origin <version>
```

Tag the `main` commit that resulted from the merge, not the feature branch
tip. Pull first to make sure you're tagging the actual merge commit (or squash
commit, see the merge-mode gotcha below).

## GitHub Release

Extract the version's section from `CHANGELOG.md` (the text between the
`## [<version>] - <date>` heading and the next `## [` heading) and use it
verbatim as the release notes:

```bash
gh release create <version> --title <version> --notes-file <path-to-extracted-section>
```

**Never use `--generate-notes`, and never hand-write different wording.** The
changelog is the single source of truth; the release notes should say exactly
what the changelog says, so there's one place to look for what shipped in a
given version, not two slightly different accounts.

## Merge-mode gotcha

This repo disables merge commits in branch protection, so `gh pr merge --squash`
is the only merge mode that works. `--merge` fails outright. This matters here
specifically because it determines what commit ends up on `main` for you to
tag: a squash merge produces a single new commit on `main`, not the original
feature-branch commits. This gotcha is only directly relevant on the
Dependabot autonomous path (where the flow performs its own merge, see the
`dependabot` skill). For a normal PR, the user does the merge in the GitHub
UI and you just need to `git pull` afterward to see whatever commit resulted.

## Using the script

`scripts/release-finalize.mjs <pr-number> <version>`:

- On the **Dependabot green path** (the only case where this script performs
  the merge itself), it squash-merges the PR (`gh pr merge <n> --squash
  --delete-branch`), then proceeds to the steps below.
- For a **normal PR**, only invoke this script after the user has already
  merged the PR themselves. It skips the merge step in that case and starts
  directly from `git checkout main && git pull`.
- In both cases, it tags `main`, pushes the tag, extracts the CHANGELOG
  section, and runs `gh release create`.
- Ends with one `FINALIZE_RESULT pr=<n> version=<version> merged=ok tag=ok
  release=<url>` line, printing the PR URL, git tag, and release URL on
  success.
