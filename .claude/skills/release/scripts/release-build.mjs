#!/usr/bin/env node
// Build -> tag -> push -> digest-verify -> scratch-port health smoke ->
// remove scratch container, for a release image. Chatty output goes to
// .release-logs/<version>-build.log; stdout is one RELEASE_RESULT line.
//
// Usage:
//   node .claude/skills/release/scripts/release-build.mjs <version>
//
// Run from the repo root. Requires podman.

import { execFileSync } from "node:child_process";
import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REGISTRY = "docker.io/eengelking/localscore";
const SCRATCH_PORT = 18080;
const SCRATCH_CONTAINER = "localscore-release-smoke";

function parseArgs(argv) {
  const [version] = argv;
  if (!version) {
    console.error("Usage: release-build.mjs <version>");
    process.exit(1);
  }
  return { version };
}

function log(logPath, text) {
  appendFileSync(logPath, text + "\n");
}

function run(logPath, cmd, args, opts = {}) {
  log(logPath, `$ ${cmd} ${args.join(" ")}`);
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", ...opts });
    log(logPath, out);
    return { ok: true, out };
  } catch (err) {
    const out = (err.stdout ?? "") + (err.stderr ?? "");
    log(logPath, out);
    log(logPath, `FAILED: ${err.message}`);
    return { ok: false, error: err.message, out };
  }
}

function fail(version, step, error, logPath) {
  console.log(
    `RELEASE_RESULT version=${version} step=${step} error="${String(error).replace(/"/g, "'").slice(0, 200)}" log=${logPath}`
  );
  process.exit(1);
}

async function pollHealth(url, attempts = 20, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.json();
        if (body.ok === true) return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function main() {
  const { version } = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const logDir = join(root, ".release-logs");
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${version}-build.log`);

  // Build
  const build = run(logPath, "podman", ["build", "--format", "docker", "-t", `localscore:${version}`, "."]);
  if (!build.ok) return fail(version, "build", build.error, logPath);

  // Tag
  const tagVersion = run(logPath, "podman", ["tag", `localscore:${version}`, `${REGISTRY}:${version}`]);
  if (!tagVersion.ok) return fail(version, "tag-version", tagVersion.error, logPath);
  const tagLatest = run(logPath, "podman", ["tag", `localscore:${version}`, `${REGISTRY}:latest`]);
  if (!tagLatest.ok) return fail(version, "tag-latest", tagLatest.error, logPath);

  // Push
  const pushVersion = run(logPath, "podman", ["push", `${REGISTRY}:${version}`]);
  if (!pushVersion.ok) return fail(version, "push-version", pushVersion.error, logPath);
  const pushLatest = run(logPath, "podman", ["push", `${REGISTRY}:latest`]);
  if (!pushLatest.ok) return fail(version, "push-latest", pushLatest.error, logPath);

  // Digest verify
  const digestVersion = run(logPath, "podman", ["inspect", `${REGISTRY}:${version}`, "--format", "{{.Digest}}"]);
  const digestLatest = run(logPath, "podman", ["inspect", `${REGISTRY}:latest`, "--format", "{{.Digest}}"]);
  if (!digestVersion.ok || !digestLatest.ok) {
    return fail(version, "digest-verify", "could not read digest for one or both tags", logPath);
  }
  if (digestVersion.out.trim() !== digestLatest.out.trim()) {
    return fail(
      version,
      "digest-verify",
      `digest mismatch: ${version}=${digestVersion.out.trim()} latest=${digestLatest.out.trim()}`,
      logPath
    );
  }

  // Health smoke on scratch port
  run(logPath, "podman", ["rm", "-f", SCRATCH_CONTAINER]); // best-effort cleanup of any stale container
  const runContainer = run(logPath, "podman", [
    "run", "-d", "--name", SCRATCH_CONTAINER, "-p", `${SCRATCH_PORT}:8080`, `localscore:${version}`,
  ]);
  if (!runContainer.ok) return fail(version, "smoke-run", runContainer.error, logPath);

  const healthy = await pollHealth(`http://localhost:${SCRATCH_PORT}/api/health`);
  run(logPath, "podman", ["rm", "-f", SCRATCH_CONTAINER]);

  if (!healthy) return fail(version, "healthcheck", "smoke container never reported healthy", logPath);

  console.log(`RELEASE_RESULT version=${version} build=ok push=ok digestMatch=ok healthcheck=ok log=${logPath}`);
}

main();
