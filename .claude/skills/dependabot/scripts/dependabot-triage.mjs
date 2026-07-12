#!/usr/bin/env node
// One compact line per open Dependabot PR instead of full body dumps.
// Classifies patch/minor/major from the "from X to Y" in the PR title.
//
// Usage:
//   node .claude/skills/dependabot/scripts/dependabot-triage.mjs [--watch]
//
// Requires gh. Ends with one TRIAGE_RESULT line (non-watch mode).

import { execFileSync } from "node:child_process";

function listPrs() {
  const raw = execFileSync(
    "gh",
    [
      "pr", "list",
      "--author", "app/dependabot",
      "--json", "number,title,statusCheckRollup,mergeStateStatus",
    ],
    { encoding: "utf8" }
  );
  return JSON.parse(raw);
}

function classify(title) {
  const match = title.match(/from\s+([\d.]+)\s+to\s+([\d.]+)/i);
  if (!match) return { pkg: null, from: null, to: null, level: "unknown" };
  const [, from, to] = match;
  const [fMajor, fMinor] = from.split(".").map(Number);
  const [tMajor, tMinor] = to.split(".").map(Number);
  let level = "patch";
  if (tMajor > fMajor) level = "MAJOR";
  else if (tMinor > fMinor) level = "minor";
  const pkgMatch = title.match(/[Bb]ump\s+`?([^\s`]+)`?\s+from/);
  return { pkg: pkgMatch ? pkgMatch[1] : "?", from, to, level };
}

function ciStatus(rollup) {
  if (!rollup || rollup.length === 0) return "pending";
  const states = rollup.map((c) => c.conclusion || c.status || "pending");
  if (states.some((s) => s === "FAILURE" || s === "failure")) return "fail";
  if (states.every((s) => s === "SUCCESS" || s === "success")) return "pass";
  return "pending";
}

function printLine(pr) {
  const { pkg, from, to, level } = classify(pr.title);
  const ci = ciStatus(pr.statusCheckRollup);
  const branch = pr.mergeStateStatus === "BEHIND" ? "BEHIND" : "CLEAN";
  console.log(
    `#${pr.number}  ${pkg}  ${from} -> ${to}  ${level}  ci=${ci}  branch=${branch}`
  );
  return { level, ci };
}

function summarize(results) {
  const counts = { patch: 0, minor: 0, MAJOR: 0, unknown: 0 };
  for (const r of results) counts[r.level] = (counts[r.level] ?? 0) + 1;
  console.log(
    `TRIAGE_RESULT open=${results.length} patch=${counts.patch} minor=${counts.minor} major=${counts.MAJOR}`
  );
}

async function watchLoop() {
  const seen = new Map();
  console.log("Watching for Dependabot PR status changes (Ctrl+C to stop)...");
  while (true) {
    const prs = listPrs();
    for (const pr of prs) {
      const ci = ciStatus(pr.statusCheckRollup);
      const key = `${pr.number}`;
      const prev = seen.get(key);
      if (prev !== ci) {
        printLine(pr);
        seen.set(key, ci);
      }
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
}

async function main() {
  const watch = process.argv.includes("--watch");
  if (watch) {
    await watchLoop();
    return;
  }
  const prs = listPrs();
  const results = prs.map(printLine);
  summarize(results);
}

main();
