# localscore

**localscore** turns a CVSS base score into the score that actually applies to *your* systems.

A vulnerability scanner reports a 10.0 and everyone panics — but the CVSS base score describes a worst-case target: reachable from anywhere, full of secrets, and impossible to lose. Most real systems don't look like that. CVSS has environmental metrics built in to correct for this, but the official calculators are expert-facing and almost nobody uses them.

localscore fixes that by asking plain-English questions about a location instead of CVSS jargon, then applying the answers to any vulnerability you paste in.

> Self-hosted, single container, SQLite on a volume. No account, no cloud dependency — the only optional network call is looking up a CVE by ID from NVD.

## How it works

1. **Define a location.** Give it a name, e.g. *"My Data Center"*, *"Retail Kiosks"*, *"Dev Lab"*.
2. **Answer the interview.** ~12 short questions — how reachable it is, whether it needs a login, what happens if data on it leaks or the box goes down, whether compromising it gives an attacker a path to anything else. No CVSS knowledge required.
3. **Repeat for each location you care about.** Every environment gets its own saved profile.
4. **Paste a CVSS vector or a CVE ID.** localscore fetches the base score and, for every environment you've defined, shows the *modified* score next to it — with a plain-English breakdown of exactly which answers caused each change.

A 9.8 "Critical" against a production database might land at 9.8 for your data center and 0.0 for a disposable dev environment that gets rebuilt from a pipeline every morning. Same vulnerability, two very different stories — and now you can see both.

## Status

The implementation spec is done ([`SPEC.md`](./SPEC.md)); scaffolding is built on top of it. What works today:

- An npm-workspaces monorepo (`server/` = Hono + SQLite API, `web/` = React + Vite frontend), served from one process on one port.
- The full 12-question interview catalog, and environment CRUD — you can create an environment, save interview answers, and have them derive into stored CVSS environmental metrics.
- **Scoring works.** `POST /api/score` parses a CVSS v4.0/v3.1/v3.0 vector and returns the base score plus every environment's modified score, backed by `ae-cvss-calculator` validated against FIRST's reference vectors — including the exact worked example from `SPEC.md` §6 (a `9.8` base score landing at `0.0` for a disposable dev environment).
- A container image that builds and runs cleanly under Podman (or Docker), passes its own `HEALTHCHECK`, and comes in under 300 MB.

What's not built yet:

- **NVD CVE lookup** (`GET /api/cve/:cveId`) and saved-vulnerability CRUD return `501 Not Implemented`.
- The frontend is still a placeholder page (just an API health check) — the interview UI and results screen that would actually use the scoring API don't exist yet.
- No published image — `ghcr.io/<owner>/localscore` doesn't exist yet, so the commands below only work against a local build for now.

## Running it

There's no published image yet, so build locally first:

```bash
podman build --format docker -t localscore .
```

(The `--format docker` flag matters: Podman defaults to the OCI image format, which silently drops the Dockerfile's `HEALTHCHECK` instruction. Without it, `podman ps` and `podman inspect` won't show a health status.)

Then run it:

```bash
podman run -d --name localscore -p 8080:8080 \
  -v localscore-data:/data \
  localscore
```

or with a bind mount so the database lands on disk somewhere you control:

```bash
podman run -d --name localscore -p 8080:8080 \
  -v "$PWD/data:/data" \
  localscore
```

Then open `http://localhost:8080`. Once a version is published, the plan is to run it straight from `ghcr.io/<owner>/localscore:latest` — same commands, just swap the image name.

Any OCI-compatible tool (Docker included) works the same way — the image and `compose.yaml` aren't Podman-specific.

Also see `compose.yaml` for the same setup as a single `podman compose up` (or `docker compose up`). See `SPEC.md` §9 for full container/operations details.

## Developing locally

Without a container, for iterating on the code:

```bash
npm install
npm run dev:server   # API on :8080, reloads on change
npm run dev:web      # Vite dev server, proxies /api to :8080
```

`npm test`, `npm run typecheck`, and `npm run lint` all run against both workspaces. See [`CLAUDE.md`](./CLAUDE.md) for the full command reference and architecture notes.

## What it does *not* do

- It doesn't scan anything or talk to your infrastructure — you tell it about a location by answering questions, and you paste in vectors or CVE IDs.
- It doesn't guess whether an exploit exists in the wild (CVSS threat/temporal metrics) — those are per-vulnerability, not per-environment, and are shown read-only from whatever you paste in.
- It doesn't support CVSS v2.0 yet (NVD stopped assigning it in 2022; see `SPEC.md` §11 for the roadmap).
- It doesn't require an internet connection, except for the optional "look up this CVE by ID" convenience.

## Why this exists

Longer background on the problem this tool solves: [*"That CVSS 10 Might Actually Be a Zero"*](https://edengelking.com/blog/that-cvss-10-might-actually-be-a-zero) — the base score is only one input into a much bigger scoring system, and the environmental metrics are the part almost nobody reads.
