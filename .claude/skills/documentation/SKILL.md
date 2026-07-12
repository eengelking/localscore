---
name: documentation
description: Run this skill before committing any change in the localscore repo (the doc-sync check), whenever editing README.md, CLAUDE.md, or files under docs/, whenever a code change alters an API route/request/response shape/status code, or whenever adding a CHANGELOG.md entry. Also consult it any time you're about to write user-facing or project prose (in-app copy, commit messages, PR descriptions, issue bodies, docs) and want the house voice guide. Other skills (testing, release, dependabot, attestation) reference this skill by name for voice and changelog conventions rather than duplicating them.
---

# Documentation

localscore's documentation has to stay truthful as the code changes, and its prose
has to read like a person wrote it, not a template. This skill owns both.

## The doc-sync rule

Before committing any change, deliberately check three files for claims the change
made stale:

- `CLAUDE.md`: the Status/topical section covering what changed
- `README.md`
- `docs/API.md`, if the change alters mandated API behavior (a new route, a
  changed request/response shape, a new status code, a new error case)

Look for a feature described as "not built yet" that this change just built, a
route or shape that changed, or a screen that didn't exist before. Fix the stale
claim in the **same commit** as the code, not a follow-up. Do this as a deliberate
last step before committing, not opportunistically while coding. It's easy to
forget a doc line when you're deep in the implementation, so treat it as its own
checklist item at the end.

If the change alters routes/shapes/status codes/error bodies, read
`resources/api-docs.md` before touching `docs/API.md`. If it alters how the
project is tested, read `resources/testing-docs.md`. If it's release-worthy, read
`resources/changelog.md` before touching `CHANGELOG.md`.

## Placement policy

All project documentation except `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`,
and `CLAUDE.md` itself lives under `docs/` (e.g. `docs/API.md`, `docs/BACKEND.md`,
`docs/FRONTEND.md`). When adding a new doc, put it under `docs/` and link to it
from `README.md`/`CLAUDE.md` as appropriate. Never add a new root-level `.md`
file.

The one exception is GitHub-specific community-health files, since GitHub only
recognizes them at fixed paths: `.github/CODE_OF_CONDUCT.md`, `.github/SECURITY.md`,
`.github/ISSUE_TEMPLATE/*`, and `.github/pull_request_template.md`. These live
under `.github/`, not `docs/`; `CONTRIBUTING.md` links to the first two rather
than duplicating their content inline.

## Voice guide

This applies everywhere prose is written for this project: README, CLAUDE.md,
docs, commit messages, PR descriptions, issue bodies, in-app copy, all of it.

**Write like a person, not like an AI.** Say the thing plainly, the way you'd
explain it to a colleague.

- No em-dashes, anywhere user-facing or in project prose. Use a period, a comma,
  or "and"/"but" instead. (`server/test/catalog.test.ts` has a regression test
  scanning every catalog question/label/`whyWeAsk`/`finePrint`/`helpDetail`
  string for `—`; the same discipline applies to every other prose surface even
  where there's no automated test for it.)
- No formulaic constructions: "It's not just X, it's Y", triplet lists built for
  rhythm rather than content, "Whether you're doing A or B, ..." framing.
- No corporate/marketing filler: "robust", "seamless", "elevate", "unlock", and
  similar words that sound like they're selling something rather than describing
  it.
- Reread what you wrote once, specifically hunting for these tells, before
  calling it finished. This is a real pass, not a formality, and the tells are
  easy to write without noticing but easy to catch on a dedicated reread.

### In-app copy conventions

- Every user-facing mention of "localscore" is wrapped in `<strong>`.
- Button, tab, and `.link-button` labels use Title Case.
- Option cards, `aria-label`s, tooltips, and placeholders stay in sentence case.

## Global workflow rules

These apply across every workflow in this repo (testing, release, dependabot,
attestation) and live here since this is the first-referenced skill; other
skills point back to this section by name rather than repeating it:

- Never commit directly to `main`. Branch off the latest `main` before starting
  any work.
- Commit subject lines are short titles, well under 72 characters, with detail
  in the body after a blank line, ending with the
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer. A long
  subject line makes GitHub's PR-creation autofill (which pulls title/body from
  a single-commit branch's commit message) split mid-sentence, so the tail spills
  into the description looking broken. A short subject plus a real body
  paragraph is what makes that autofill look intentional.
- All GitHub operations (issues, PR status/checks, viewing existing issues, etc.)
  go through the `gh` CLI, not manual web UI steps or guessed URLs.
- The maintainer runs **Podman, not Docker**, day to day. All commands and docs
  in this repo use `podman`/`podman compose`, even though the underlying
  Dockerfile/compose file are plain OCI and work under Docker too.
- Merging PRs stays manual (the user reviews and merges in the GitHub UI),
  **except** the documented Dependabot patch/minor autonomous path, owned by the
  `dependabot` skill.

## Resources

- `resources/api-docs.md`: keeping `docs/API.md` in sync with the actual route
  table.
- `resources/testing-docs.md`: keeping testing procedure docs from forking
  across `CLAUDE.md`/`CONTRIBUTING.md` and the `testing` skill.
- `resources/changelog.md`: `CHANGELOG.md` conventions, with real entry
  examples from this repo's history.
