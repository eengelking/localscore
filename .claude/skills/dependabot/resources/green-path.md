# Green path: pre-authorized autonomous patch/minor handling

This flow is **pre-authorized**, no need to check with the user first, once a
Dependabot PR meets all of: CI green, branch up to date with `main`, and a
patch or minor semver bump. (Major bumps never qualify, see `SKILL.md`. If
anything about the PR seems off despite meeting these criteria, that overrides
the pre-authorization, ask instead.)

## Steps

1. **Check out the branch.**

   ```bash
   gh pr checkout <number>
   ```

2. **Version bump + changelog entry**, per the `release` skill's
   `version-bump.md` mechanics: a patch bump, consistent with a dependency
   bump being a small change by default (a Dependabot PR is never itself the
   trigger for a minor or major *localscore* version, even if the dependency
   jump itself is minor/major, the app's own version moves by the smallest
   increment that reflects "we took a dependency update"). Use the release
   skill's script with the PR-derived note:

   ```bash
   node .claude/skills/release/scripts/release-bump.mjs <new-version> --from-pr <number>
   ```

   Review the diff, then commit it onto the Dependabot branch (short subject
   line, `Co-Authored-By` trailer, see the `release` skill's
   `branch-and-pr.md`).

3. **Build, tag, push, verify** the release image from this branch, per the
   `release` skill's `container-publish.md`, using
   `scripts/release-build.mjs <new-version>` from the `release` skill.

4. **Push the bump commit** to the Dependabot branch (`git push`), then wait
   for CI to go green again on that new commit before proceeding. The version
   bump itself could in principle break something (a doc-line regex miss, a
   malformed CHANGELOG edit), so don't skip re-verifying.

5. **Self-merge**, the one documented exception to "merging stays manual":

   ```bash
   gh pr merge <number> --squash --delete-branch
   ```

   `--squash` is not optional. This repo has merge commits disabled in
   branch protection, and `--merge` fails outright.

6. **Finalize**: git tag + GitHub Release, per the `release` skill's
   `tag-and-github-release.md`. Use `scripts/release-finalize.mjs <number>
   <new-version> --merge` from the `release` skill (the `--merge` flag there
   is what authorizes that script to perform step 5 itself, if you'd rather
   run finalize as one call instead of a separate `gh pr merge`, either
   ordering is fine as long as CI is green on the bump commit before the merge
   happens).

## Why this is safe to automate

Every step above is either fully mechanical (version bump, build/tag/push,
tag/release) or gated on a check that already ran (green CI on the bump
commit). The one irreversible action, merging, only happens after that final
green check, on a PR that was already patch/minor and CI-clean before you
started. This is what makes it different from a normal PR merge, which stays
in the user's hands.
