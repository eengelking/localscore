# Branch and PR mechanics

This is the shared home for branch/PR mechanics. Other skills reference it by
name (`release`'s `branch-and-pr.md`) rather than duplicating it.

## Branching

Never commit directly to `main`. Before starting any work, branch off the
**latest** `main`, not an existing feature branch:

```bash
git checkout main && git pull && git checkout -b <descriptive-branch-name>
```

Branching off a stale local `main` or off another feature branch risks
carrying unrelated changes into the PR, or missing something that already
landed.

## Commit message hygiene

**Subject line is a short title, not a sentence.** Aim for well under 72
characters, with detail in the body after a blank line, ending with:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

This matters mechanically, not just stylistically: GitHub's "Create pull
request" form auto-fills the PR title and description directly from a
single-commit branch's commit message. If the subject line runs long, GitHub
splits it at an arbitrary character count instead of a word or sentence
boundary, so the tail of the title spills into the top of the description
looking broken (this happened for real on this project, on the
`chore/gh-cli-release-workflow-1.0.1` PR). A short subject plus a real body
paragraph is what makes the autofilled title and description look intentional.

Prefer creating a new commit over amending, unless explicitly asked to amend.

## Opening the PR

Use the `gh` CLI, not the web UI, for every GitHub operation. Open the PR
yourself once the branch is pushed:

```bash
gh pr create --title "..." --body "$(cat <<'EOF'
## Summary
...

## Test plan
- [ ] ...
EOF
)"
```

Always pass a real `--title` and `--body`. Don't rely on GitHub's
commit-message autofill (see above for why that can look broken), even though
the underlying commit message should already be well-formed on its own.

## Watching CI

```bash
gh pr checks --watch
```

Or `gh run watch` if you need finer-grained log access. A red check is treated
exactly like a local test failure (see the `testing` skill). Never push past
it, and don't report the PR as ready until it's resolved.

Report back the PR link plus pass/fail once CI resolves, whether or not the
change also goes through the release flow.

## Merging

Merging stays manual. The user reviews and merges in the GitHub UI. The one
documented exception is the Dependabot patch/minor autonomous path (owned by
the `dependabot` skill), which is explicitly pre-authorized to self-merge via
`gh pr merge --squash` (this repo has merge commits disabled in branch
protection, so `--squash` is the only merge mode that works here; `--merge`
fails outright).
