# Version bump mechanics

Performed as a single commit, typically the last one on the feature branch
before pushing, once the code changes are otherwise done and verified (see the
`testing` skill for what "verified" means before this step).

## What gets bumped

1. **`version` in three `package.json` files**, all kept identical: root
   `package.json`, `server/package.json`, `web/package.json`. Bumping only one
   or two is a real bug (the container build reads from more than one of
   these), so always bump all three together.
2. **Any doc literally quoting the current published tag.** Today that's
   `README.md`'s image line(s) and `CLAUDE.md`'s "Published image" mention.
   Search for the current version string across `README.md`/`CLAUDE.md`/
   `docs/*` before assuming you found every occurrence. A grep for the old
   version number is more reliable than relying on memory of where it's
   quoted.
3. **`CHANGELOG.md`**: move the `[Unreleased]` section's entries under a new
   `## [<new-version>] - <YYYY-MM-DD>` heading (today's date). If
   `[Unreleased]` was empty, add a bullet summarizing the change instead of
   leaving the new section empty. Add the matching compare-link reference at
   the bottom of the file, in descending order with the existing links. Entry
   *style* (how to phrase a bullet, the dependency-bump conventions, the
   major-bump paragraph pattern) is owned by the `documentation` skill's
   `changelog.md` resource. Read that before writing the bullet text, this
   resource only covers *when* and *where* the edit happens.

## Deciding the bump size

- **Patch**: fixes, small changes.
- **Minor**: new features.
- **Major**: only when the user has explicitly said this is a major/breaking
  release. Never infer major from diff size, number of files touched, or how
  it "feels." That's exactly the kind of judgment call this rule takes away
  from you on purpose, since major-version semantics are a promise to
  consumers of the image, not a reflection of implementation effort.
- If it's ambiguous whether a change is patch- or minor-sized, ask the user
  rather than guessing either way.

The version number itself is computed from the **prior published tag** (the
latest entry in `CHANGELOG.md`'s version history, which should match the
latest git tag), e.g. `1.2.7` to `1.2.8` for a patch, `1.2.7` to `1.3.0` for a
minor.

## Using the script

`scripts/release-bump.mjs <version> [--note "..."] [--from-pr <n>]` performs
steps 1-3 mechanically:

- Sets `version` in all three `package.json` files.
- Updates the known doc lines quoting the published tag.
- Rolls `[Unreleased]` into the new heading plus compare link. `--note "..."`
  supplies the changelog bullet text directly; `--from-pr <n>` derives a
  simple dependency-bump bullet from that PR's title for the common
  single-dependency Dependabot case (see the `dependabot` skill's green path,
  which is the main caller of this flag).
- Prints a diffstat-style summary and exits. **Does not commit**; review the
  diff yourself (`git diff`) before committing, so a bad regex substitution
  doesn't silently land.

After running the script and reviewing the diff, commit it as its own commit
(or squash into the feature commit if that reads more naturally for a small
change). This is the commit `resources/branch-and-pr.md`'s hygiene rules
apply to.
