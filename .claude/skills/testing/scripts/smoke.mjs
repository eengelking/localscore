#!/usr/bin/env node
// Quick post-build sanity check: hits /api/health, /api/catalog, and the
// frontend's index.html against a running localscore instance, and prints
// one greppable SMOKE_RESULT line. Useful before investing in a full
// Playwright pass or the full container gate (see the testing skill's
// container-test.md).
//
// Usage:
//   node scripts/smoke.mjs [--base-url http://localhost:8081] [--timeout 10000]
//
// Exit code 0 on success, 1 on any check failing.

function parseArgs(argv) {
  const args = { baseUrl: "http://localhost:8081", timeout: 10000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url") args.baseUrl = argv[++i];
    else if (argv[i] === "--timeout") args.timeout = Number(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(
        "Usage: node scripts/smoke.mjs [--base-url http://localhost:8081] [--timeout 10000]"
      );
      process.exit(0);
    }
  }
  return args;
}

async function checkJson(url, timeoutMs, predicate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `status=${res.status}` };
    const body = await res.json();
    if (predicate && !predicate(body)) {
      return { ok: false, error: `unexpected body: ${JSON.stringify(body).slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `status=${res.status}` };
    const text = await res.text();
    if (!text.includes("<div id=\"root\"") && !text.toLowerCase().includes("<html")) {
      return { ok: false, error: "response doesn't look like the built frontend" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { baseUrl, timeout } = parseArgs(process.argv.slice(2));

  const health = await checkJson(`${baseUrl}/api/health`, timeout, (b) => b.ok === true);
  const catalog = await checkJson(
    `${baseUrl}/api/catalog`,
    timeout,
    (b) => Array.isArray(b.questions) && b.questions.length > 0
  );
  const frontend = await checkHtml(`${baseUrl}/`, timeout);

  const results = { health, catalog, frontend };
  const allOk = Object.values(results).every((r) => r.ok);

  const parts = Object.entries(results).map(([name, r]) =>
    r.ok ? `${name}=ok` : `${name}=FAILED error="${r.error}"`
  );
  console.log(`SMOKE_RESULT baseUrl=${baseUrl} ${parts.join(" ")}`);

  process.exit(allOk ? 0 : 1);
}

main();
