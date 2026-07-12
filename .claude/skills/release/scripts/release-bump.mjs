#!/usr/bin/env node
// Mechanical version bump: bumps version in the three package.jsons, updates
// doc lines quoting the published tag, and rolls CHANGELOG.md's [Unreleased]
// section into a new dated version heading + compare link.
//
// Does NOT commit. Review `git diff` yourself before committing.
//
// Usage:
//   node .claude/skills/release/scripts/release-bump.mjs <version> [--note "..."] [--from-pr <n>]
//
// Run from the repo root.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

function parseArgs(argv) {
  const [version, ...rest] = argv;
  if (!version || version.startsWith("--")) {
    console.error("Usage: release-bump.mjs <version> [--note \"...\"] [--from-pr <n>]");
    process.exit(1);
  }
  const args = { version, note: null, fromPr: null };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--note") args.note = rest[++i];
    else if (rest[i] === "--from-pr") args.fromPr = rest[++i];
  }
  return args;
}

function bumpPackageJson(path, version, changed) {
  const raw = readFileSync(path, "utf8");
  const pkg = JSON.parse(raw);
  const oldVersion = pkg.version;
  pkg.version = version;
  // Preserve trailing newline convention.
  const out = JSON.stringify(pkg, null, 2) + (raw.endsWith("\n") ? "\n" : "");
  writeFileSync(path, out);
  changed.push(`${path}: ${oldVersion} -> ${version}`);
}

function bumpTagLines(path, oldTagPattern, version, changed) {
  const raw = readFileSync(path, "utf8");
  const re = new RegExp(oldTagPattern, "g");
  let count = 0;
  const out = raw.replace(re, (match) => {
    count++;
    return match.replace(/\d+\.\d+\.\d+/, version);
  });
  if (count > 0) {
    writeFileSync(path, out);
    changed.push(`${path}: updated ${count} tag reference(s)`);
  }
  return count;
}

function deriveNoteFromPr(prNumber) {
  const body = execFileSync("gh", ["pr", "view", String(prNumber), "--json", "title"], {
    encoding: "utf8",
  });
  const { title } = JSON.parse(body);
  const match = title.match(/[Bb]ump\s+`?([^\s`]+)`?\s+from\s+([\d.]+)\s+to\s+([\d.]+)/);
  if (!match) {
    return `Bump dependency per #${prNumber} (see PR for details).`;
  }
  const [, pkg, from, to] = match;
  return `Bump \`${pkg}\` from ${from} to ${to} (patch, Dependabot).`;
}

function rollChangelog(path, version, note, changed) {
  const raw = readFileSync(path, "utf8");
  const today = new Date().toISOString().slice(0, 10);

  const unreleasedRe = /## \[Unreleased\]\n([\s\S]*?)(?=\n## \[)/;
  const match = raw.match(unreleasedRe);
  if (!match) {
    throw new Error("Could not find [Unreleased] section in CHANGELOG.md");
  }
  const unreleasedBody = match[1].trim();
  const fallbackBullet = note ? `- ${note}` : "- (no summary provided)";
  const newSectionBody = unreleasedBody.length > 0 ? unreleasedBody : fallbackBullet;

  const newHeading = `## [Unreleased]\n\n## [${version}] - ${today}\n\n${newSectionBody}\n`;
  const updated = raw.replace(unreleasedRe, newHeading);

  // Insert compare link. Find the [Unreleased]: ... line and the version
  // immediately below it (the previous latest version) to build the new link.
  const unreleasedLinkRe = /^\[Unreleased\]: (.+)\/compare\/([\w.]+)\.\.\.HEAD$/m;
  const linkMatch = updated.match(unreleasedLinkRe);
  if (!linkMatch) {
    throw new Error("Could not find [Unreleased] compare link in CHANGELOG.md");
  }
  const [fullLine, repoUrl, prevVersion] = linkMatch;
  const newUnreleasedLink = `[Unreleased]: ${repoUrl}/compare/${version}...HEAD`;
  const newVersionLink = `[${version}]: ${repoUrl}/compare/${prevVersion}...${version}`;
  const finalContent = updated.replace(
    fullLine,
    `${newUnreleasedLink}\n${newVersionLink}`
  );

  writeFileSync(path, finalContent);
  changed.push(`${path}: rolled [Unreleased] into [${version}] - ${today}, added compare link`);
}

function main() {
  const { version, note: noteArg, fromPr } = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const changed = [];

  const note = fromPr ? deriveNoteFromPr(fromPr) : noteArg;

  bumpPackageJson(join(root, "package.json"), version, changed);
  bumpPackageJson(join(root, "server/package.json"), version, changed);
  bumpPackageJson(join(root, "web/package.json"), version, changed);

  bumpTagLines(join(root, "README.md"), "docker\\.io/eengelking/localscore:\\d+\\.\\d+\\.\\d+", version, changed);
  bumpTagLines(
    join(root, "CLAUDE.md"),
    "docker\\.io/eengelking/localscore` \\(tags `latest`, `\\d+\\.\\d+\\.\\d+`\\)",
    version,
    changed
  );

  rollChangelog(join(root, "CHANGELOG.md"), version, note, changed);

  console.log(`BUMP_RESULT version=${version} files=${changed.length}`);
  for (const line of changed) console.log(`  - ${line}`);
  console.log("\nNot committed. Review `git diff` before committing.");
}

main();
