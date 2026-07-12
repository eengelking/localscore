#!/usr/bin/env node
// Post-merge finalize: (Dependabot green path only) squash-merge the PR,
// then in all cases pull main, git tag + push, extract the CHANGELOG
// section, and gh release create. Ends with one FINALIZE_RESULT line.
//
// Usage:
//   node .claude/skills/release/scripts/release-finalize.mjs <pr-number> <version> [--merge]
//
// Pass --merge only on the Dependabot autonomous path where this script is
// authorized to self-merge. For a normal PR, merge it yourself in the GitHub
// UI first, then run this script without --merge.
//
// Run from the repo root. Requires gh and git.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function parseArgs(argv) {
  const [prNumber, version, ...rest] = argv;
  if (!prNumber || !version) {
    console.error("Usage: release-finalize.mjs <pr-number> <version> [--merge]");
    process.exit(1);
  }
  return { prNumber, version, doMerge: rest.includes("--merge") };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();
}

function fail(prNumber, version, step, error) {
  console.log(
    `FINALIZE_RESULT pr=${prNumber} version=${version} step=${step} error="${String(error).replace(/"/g, "'").slice(0, 200)}"`
  );
  process.exit(1);
}

function extractChangelogSection(changelogPath, version) {
  const raw = readFileSync(changelogPath, "utf8");
  const headingRe = new RegExp(`## \\[${version.replace(/\./g, "\\.")}\\][^\n]*\n`);
  const startMatch = raw.match(headingRe);
  if (!startMatch) throw new Error(`Could not find changelog heading for ${version}`);
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = raw.slice(startIdx);
  const nextHeadingIdx = rest.search(/\n## \[/);
  const section = nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
  return section.trim() + "\n";
}

function main() {
  const { prNumber, version, doMerge } = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  if (doMerge) {
    try {
      run("gh", ["pr", "merge", prNumber, "--squash", "--delete-branch"]);
    } catch (err) {
      return fail(prNumber, version, "merge", err.message);
    }
  }

  try {
    run("git", ["checkout", "main"]);
    run("git", ["pull"]);
  } catch (err) {
    return fail(prNumber, version, "pull-main", err.message);
  }

  try {
    run("git", ["tag", "-a", version, "-m", version]);
    run("git", ["push", "origin", version]);
  } catch (err) {
    return fail(prNumber, version, "git-tag", err.message);
  }

  let notesPath;
  try {
    const section = extractChangelogSection(join(root, "CHANGELOG.md"), version);
    notesPath = join(tmpdir(), `localscore-release-notes-${version}.md`);
    writeFileSync(notesPath, section);
  } catch (err) {
    return fail(prNumber, version, "extract-changelog", err.message);
  }

  let releaseUrl;
  try {
    releaseUrl = run("gh", ["release", "create", version, "--title", version, "--notes-file", notesPath]);
  } catch (err) {
    return fail(prNumber, version, "gh-release-create", err.message);
  }

  console.log(
    `FINALIZE_RESULT pr=${prNumber} version=${version} merged=${doMerge ? "ok" : "skipped"} tag=ok release=${releaseUrl}`
  );
}

main();
